// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TradeExecutionLog
/// @notice On-chain log for Uniswap trade executions
contract TradeExecutionLog {
    struct Trade {
        address agent;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint24 fee;
        uint256 timestamp;
    }

    Trade[] public trades;
    mapping(address => uint256[]) private agentTrades;

    event TradeExecuted(
        address indexed agent,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 fee
    );

    /// @notice Log a trade execution
    function logTrade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 fee
    ) external {
        uint256 index = trades.length;
        trades.push(
            Trade({
                agent: msg.sender,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                amountOut: amountOut,
                fee: fee,
                timestamp: block.timestamp
            })
        );
        agentTrades[msg.sender].push(index);

        emit TradeExecuted(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            fee
        );
    }

    /// @notice Get total number of logged trades
    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }

    /// @notice Get a trade by index
    function getTrade(uint256 index) external view returns (Trade memory) {
        require(index < trades.length, "Index out of bounds");
        return trades[index];
    }

    /// @notice Get trade indices for a given agent
    function getTradesByAgent(
        address agent
    ) external view returns (uint256[] memory) {
        return agentTrades[agent];
    }
}
