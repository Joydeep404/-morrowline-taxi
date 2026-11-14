// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MorrowlineLeaderboard {
    uint8 public constant MAX_STAGE = 5;
    uint256 public constant BOARD_SIZE = 10;

    struct Progress {
        uint8 highestStage;
        uint32 totalRides;
        uint64 updatedAt;
    }

    mapping(address => Progress) public progressOf;
    address[] private leaders;

    event ProgressSubmitted(address indexed player, uint8 highestStage, uint32 totalRides, uint64 updatedAt);

    function submitProgress(uint8 highestStage, uint32 totalRides) external {
        require(highestStage <= MAX_STAGE, "Invalid stage");
        Progress storage current = progressOf[msg.sender];
        require(highestStage >= current.highestStage && totalRides >= current.totalRides, "Progress cannot decrease");
        require(highestStage > current.highestStage || totalRides > current.totalRides, "No new progress");

        current.highestStage = highestStage;
        current.totalRides = totalRides;
        current.updatedAt = uint64(block.timestamp);
        _updateLeaderboard(msg.sender);

        emit ProgressSubmitted(msg.sender, highestStage, totalRides, current.updatedAt);
    }

    function leaderCount() external view returns (uint256) {
        return leaders.length;
    }

    function leaderAt(uint256 index) external view returns (
        address player,
        uint8 highestStage,
        uint32 totalRides,
        uint64 updatedAt
    ) {
        player = leaders[index];
        Progress memory progress = progressOf[player];
        return (player, progress.highestStage, progress.totalRides, progress.updatedAt);
    }

    function _updateLeaderboard(address player) private {
        uint256 existing = leaders.length;
        for (uint256 i = 0; i < leaders.length; i++) {
            if (leaders[i] == player) {
                existing = i;
                break;
            }
        }

        if (existing < leaders.length) {
            for (uint256 i = existing; i + 1 < leaders.length; i++) leaders[i] = leaders[i + 1];
            leaders.pop();
        }

        Progress memory candidate = progressOf[player];
        uint256 insertion = leaders.length;
        for (uint256 i = 0; i < leaders.length; i++) {
            Progress memory ranked = progressOf[leaders[i]];
            if (candidate.highestStage > ranked.highestStage ||
                (candidate.highestStage == ranked.highestStage && candidate.totalRides > ranked.totalRides)) {
                insertion = i;
                break;
            }
        }

        if (insertion >= BOARD_SIZE) return;
        if (leaders.length < BOARD_SIZE) leaders.push(player);
        for (uint256 i = leaders.length - 1; i > insertion; i--) leaders[i] = leaders[i - 1];
        leaders[insertion] = player;
    }
}
