"""
n8n Integration API - Simple JSON endpoints for n8n workflow automation.

This module provides non-streaming endpoints specifically designed for n8n
workflow integration. Unlike the main hedge-fund endpoints that use SSE streaming,
these endpoints return simple JSON responses.

Endpoints:
- POST /api/analyze - Run analysis on tickers with selected agents
- GET /api/agents - List available agents
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import asyncio

from app.backend.database import get_db
from app.backend.services.api_key_service import ApiKeyService
from src.utils.analysts import ANALYST_CONFIG, get_agents_list
from src.llm.models import ModelProvider

router = APIRouter(prefix="/api")


# ============= Request/Response Models =============

class AnalyzeRequest(BaseModel):
    """Request model for the /api/analyze endpoint."""
    tickers: List[str] = Field(..., description="List of stock tickers to analyze", min_length=1)
    agents: Optional[List[str]] = Field(
        default=None, 
        description="List of agent keys to use. If not provided, uses default agents."
    )
    model_name: Optional[str] = Field(default="gpt-4o-mini", description="LLM model to use")
    model_provider: Optional[str] = Field(default="openai", description="LLM provider")
    start_date: Optional[str] = Field(default=None, description="Start date for analysis (YYYY-MM-DD)")
    end_date: Optional[str] = Field(default=None, description="End date for analysis (YYYY-MM-DD)")


class AgentResult(BaseModel):
    """Result from a single agent's analysis."""
    agent: str
    agent_display_name: str
    signal: str  # BULLISH, BEARISH, NEUTRAL
    confidence: float
    reasoning: Optional[str] = None


class TickerAnalysis(BaseModel):
    """Complete analysis for a single ticker."""
    ticker: str
    agents: List[AgentResult]
    aggregated_signal: str
    aggregated_confidence: float
    bullish_count: int
    bearish_count: int
    neutral_count: int
    timestamp: str


class AnalyzeResponse(BaseModel):
    """Response model for the /api/analyze endpoint."""
    success: bool
    analyses: List[TickerAnalysis]
    metadata: Dict[str, Any]


class AgentInfo(BaseModel):
    """Information about an available agent."""
    key: str
    display_name: str
    description: str
    investing_style: str


class AgentsResponse(BaseModel):
    """Response model for the /api/agents endpoint."""
    agents: List[AgentInfo]
    total: int


# ============= Helper Functions =============

def get_default_agents() -> List[str]:
    """Get default list of agents for analysis."""
    # Use a balanced set of agents for n8n automation
    return [
        "warren_buffett",
        "peter_lynch", 
        "ben_graham",
        "technical_analyst",
        "fundamentals_analyst",
        "valuation_analyst",
    ]


def aggregate_signals(agent_results: List[AgentResult]) -> tuple[str, float]:
    """
    Aggregate signals from multiple agents.
    
    Returns:
        tuple: (aggregated_signal, aggregated_confidence)
    """
    if not agent_results:
        return "NEUTRAL", 0.0
    
    bullish_count = sum(1 for r in agent_results if r.signal.upper() == "BULLISH")
    bearish_count = sum(1 for r in agent_results if r.signal.upper() == "BEARISH")
    neutral_count = sum(1 for r in agent_results if r.signal.upper() == "NEUTRAL")
    
    total = len(agent_results)
    
    # Determine aggregated signal based on majority
    if bullish_count > bearish_count and bullish_count > neutral_count:
        aggregated_signal = "BULLISH"
        weight = bullish_count / total
    elif bearish_count > bullish_count and bearish_count > neutral_count:
        aggregated_signal = "BEARISH"
        weight = bearish_count / total
    else:
        aggregated_signal = "NEUTRAL"
        weight = max(neutral_count, min(bullish_count, bearish_count)) / total
    
    # Calculate weighted average confidence
    avg_confidence = sum(r.confidence for r in agent_results) / total
    aggregated_confidence = round(avg_confidence * weight, 2)
    
    return aggregated_signal, aggregated_confidence


async def run_single_agent(
    agent_key: str,
    ticker: str,
    start_date: str,
    end_date: str,
    model_name: str,
    model_provider: str,
    api_keys: dict,
) -> Optional[AgentResult]:
    """
    Run a single agent's analysis on a ticker.
    
    This is a simplified version that directly calls the agent function
    without the full graph infrastructure.
    """
    from langchain_core.messages import HumanMessage
    from src.graph.state import AgentState
    import os
    
    # Set API keys in environment
    for key, value in api_keys.items():
        if value:
            os.environ[key] = value
    
    if agent_key not in ANALYST_CONFIG:
        return None
    
    config = ANALYST_CONFIG[agent_key]
    agent_func = config["agent_func"]
    
    try:
        # Create minimal state for the agent
        initial_state: AgentState = {
            "messages": [
                HumanMessage(content=f"Analyze {ticker} for investment decision.")
            ],
            "data": {
                "tickers": [ticker],
                "portfolio": {"cash": 100000, "positions": {}},
                "start_date": start_date,
                "end_date": end_date,
                "analyst_signals": {},
            },
            "metadata": {
                "show_reasoning": True,
                "model_name": model_name,
                "model_provider": model_provider,
            },
        }
        
        # Run the agent in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, 
            lambda: agent_func(initial_state, agent_key)
        )
        
        # Extract signal from result
        if result and "data" in result:
            analyst_signals = result["data"].get("analyst_signals", {})
            agent_signal = analyst_signals.get(agent_key, {}).get(ticker, {})
            
            signal = agent_signal.get("signal", "neutral").upper()
            confidence = agent_signal.get("confidence", 50)
            reasoning = agent_signal.get("reasoning", "")
            
            # Truncate reasoning if too long
            if reasoning and len(reasoning) > 500:
                reasoning = reasoning[:500] + "..."
            
            return AgentResult(
                agent=agent_key,
                agent_display_name=config["display_name"],
                signal=signal,
                confidence=confidence,
                reasoning=reasoning
            )
    
    except Exception as e:
        print(f"Error running agent {agent_key} for {ticker}: {e}")
        return AgentResult(
            agent=agent_key,
            agent_display_name=config["display_name"],
            signal="NEUTRAL",
            confidence=0,
            reasoning=f"Error: {str(e)}"
        )
    
    return None


# ============= API Endpoints =============

@router.get(
    path="/agents",
    response_model=AgentsResponse,
    summary="List available agents",
    description="Returns a list of all available analysis agents that can be used with /api/analyze"
)
async def list_agents():
    """Get the list of available analysis agents."""
    try:
        agents = [
            AgentInfo(
                key=key,
                display_name=config["display_name"],
                description=config["description"],
                investing_style=config["investing_style"]
            )
            for key, config in ANALYST_CONFIG.items()
        ]
        
        return AgentsResponse(agents=agents, total=len(agents))
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve agents: {str(e)}")


@router.post(
    path="/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze tickers with AI agents",
    description="""
    Run AI agent analysis on one or more stock tickers.
    
    This endpoint is designed for n8n workflow integration and returns
    a simple JSON response (no streaming).
    
    **Example Request:**
    ```json
    {
        "tickers": ["AAPL", "TSLA"],
        "agents": ["warren_buffett", "peter_lynch"],
        "model_name": "gpt-4o-mini",
        "model_provider": "openai"
    }
    ```
    
    **Response includes:**
    - Individual agent signals with confidence and reasoning
    - Aggregated signal based on agent consensus
    - Bullish/Bearish/Neutral counts
    """
)
async def analyze_tickers(request: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    Analyze tickers using selected AI agents.
    
    Args:
        request: AnalyzeRequest containing tickers and configuration
        db: Database session for API key retrieval
    
    Returns:
        AnalyzeResponse with analysis results for each ticker
    """
    try:
        # Get API keys from database
        api_key_service = ApiKeyService(db)
        api_keys = api_key_service.get_api_keys_dict()
        
        # Determine which agents to use
        agents_to_use = request.agents if request.agents else get_default_agents()
        
        # Validate agent keys
        valid_agents = [a for a in agents_to_use if a in ANALYST_CONFIG]
        if not valid_agents:
            raise HTTPException(
                status_code=400, 
                detail=f"No valid agents specified. Available agents: {list(ANALYST_CONFIG.keys())}"
            )
        
        # Set date range
        end_date = request.end_date or datetime.now().strftime("%Y-%m-%d")
        start_date = request.start_date or (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        
        # Analyze each ticker
        analyses = []
        
        for ticker in request.tickers:
            ticker = ticker.upper().strip()
            agent_results = []
            
            # Run each agent for this ticker
            for agent_key in valid_agents:
                result = await run_single_agent(
                    agent_key=agent_key,
                    ticker=ticker,
                    start_date=start_date,
                    end_date=end_date,
                    model_name=request.model_name,
                    model_provider=request.model_provider,
                    api_keys=api_keys,
                )
                
                if result:
                    agent_results.append(result)
            
            # Aggregate signals
            aggregated_signal, aggregated_confidence = aggregate_signals(agent_results)
            
            # Count signals
            bullish_count = sum(1 for r in agent_results if r.signal.upper() == "BULLISH")
            bearish_count = sum(1 for r in agent_results if r.signal.upper() == "BEARISH")
            neutral_count = sum(1 for r in agent_results if r.signal.upper() == "NEUTRAL")
            
            analyses.append(TickerAnalysis(
                ticker=ticker,
                agents=agent_results,
                aggregated_signal=aggregated_signal,
                aggregated_confidence=aggregated_confidence,
                bullish_count=bullish_count,
                bearish_count=bearish_count,
                neutral_count=neutral_count,
                timestamp=datetime.now().isoformat()
            ))
        
        return AnalyzeResponse(
            success=True,
            analyses=analyses,
            metadata={
                "model_name": request.model_name,
                "model_provider": request.model_provider,
                "agents_used": valid_agents,
                "start_date": start_date,
                "end_date": end_date,
                "total_tickers": len(request.tickers),
                "timestamp": datetime.now().isoformat()
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
