// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MorrowlineTestnetShop {
    uint8 public constant SUNSET_PAINT = 1;
    uint8 public constant TIDAL_PAINT = 2;
    uint8 public constant FUEL_BOOST = 3;
    uint8 public constant REPAIR_KIT = 4;

    uint256 public constant PAINT_PRICE = 0.00015 ether;
    uint256 public constant BOOST_PRICE = 0.00005 ether;

    address public immutable owner;
    mapping(address => mapping(uint8 => uint32)) public balanceOf;

    uint256 private withdrawalLock = 1;

    event ItemPurchased(address indexed player, uint8 indexed itemId, uint32 quantity);
    event ItemConsumed(address indexed player, uint8 indexed itemId);
    event ProceedsWithdrawn(address indexed owner, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function itemPrice(uint8 itemId) external pure returns (uint256) {
        if (itemId == SUNSET_PAINT || itemId == TIDAL_PAINT) return PAINT_PRICE;
        if (itemId == FUEL_BOOST || itemId == REPAIR_KIT) return BOOST_PRICE;
        revert("Unknown item");
    }

    function purchase(uint8 itemId) external payable {
        uint256 price;
        if (itemId == SUNSET_PAINT || itemId == TIDAL_PAINT) {
            require(balanceOf[msg.sender][itemId] == 0, "Paint already owned");
            price = PAINT_PRICE;
            balanceOf[msg.sender][itemId] = 1;
        } else if (itemId == FUEL_BOOST || itemId == REPAIR_KIT) {
            price = BOOST_PRICE;
            balanceOf[msg.sender][itemId] += 1;
        } else {
            revert("Unknown item");
        }
        require(msg.value == price, "Incorrect payment");
        emit ItemPurchased(msg.sender, itemId, balanceOf[msg.sender][itemId]);
    }

    function consume(uint8 itemId) external {
        require(itemId == FUEL_BOOST || itemId == REPAIR_KIT, "Not consumable");
        require(balanceOf[msg.sender][itemId] > 0, "No item available");
        balanceOf[msg.sender][itemId] -= 1;
        emit ItemConsumed(msg.sender, itemId);
    }

    function withdrawProceeds() external {
        require(msg.sender == owner, "Owner only");
        require(withdrawalLock == 1, "Withdrawal in progress");
        withdrawalLock = 2;
        uint256 amount = address(this).balance;
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Withdrawal failed");
        withdrawalLock = 1;
        emit ProceedsWithdrawn(owner, amount);
    }
}
