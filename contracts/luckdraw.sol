// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PoolLuckDraw is Ownable {
    constructor(address _houseWallet, address _tokenAddress) Ownable(msg.sender) {
        require(_houseWallet != address(0), "Endereco invalido");
        require(_tokenAddress != address(0), "Token invalido");
        houseWallet = _houseWallet;
        token = IERC20(_tokenAddress);
    }

    uint public groupCount = 0;
    uint public houseFeePercent = 10;

    address public houseWallet;
    IERC20 public token;

    struct Group {
        uint id;
        address creator;
        uint maxParticipants;
        uint entryFee;
        uint deadline;
        address[] participants;
        bool isClosed;
        address winner;
        uint totalPrize;
    }

    mapping(uint => Group) public groups;

    event GroupCreated(uint indexed groupId, address indexed creator, uint maxParticipants, uint entryFee, uint deadline);
    event TicketPurchased(uint indexed groupId, address indexed participant);
    event GroupClosed(uint indexed groupId, address indexed winner, uint prize);
    event HouseWalletChanged(address oldWallet, address newWallet);
    event TokenChanged(address oldToken, address newToken);

    function setHouseWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Endereco invalido");
        emit HouseWalletChanged(houseWallet, newWallet);
        houseWallet = newWallet;
    }

    function setToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Token invalido");
        emit TokenChanged(address(token), newToken);
        token = IERC20(newToken);
    }

    function createGroup(uint maxParticipants, uint entryFee, uint deadline) external {
        require(maxParticipants > 1, "Min 2 participantes");
        require(entryFee > 0, "EntryFee > 0");
        require(deadline > block.timestamp, "Deadline futuro");

        groupCount++;
        Group storage g = groups[groupCount];
        g.id = groupCount;
        g.creator = msg.sender;
        g.maxParticipants = maxParticipants;
        g.entryFee = entryFee;
        g.deadline = deadline;

        emit GroupCreated(groupCount, msg.sender, maxParticipants, entryFee, deadline);
    }

    function buyTicket(uint groupId) external {
        Group storage g = groups[groupId];

        require(!g.isClosed, "Grupo fechado");
        require(block.timestamp <= g.deadline, "Passou deadline");
        require(g.participants.length < g.maxParticipants, "Grupo cheio");

        for (uint i = 0; i < g.participants.length; i++) {
            require(g.participants[i] != msg.sender, "Ja no grupo");
        }

        bool success = token.transferFrom(msg.sender, address(this), g.entryFee);
        require(success, "Falha no pagamento");

        g.participants.push(msg.sender);
        g.totalPrize += g.entryFee;

        emit TicketPurchased(groupId, msg.sender);
    }

    function closeGroupAndPickWinner(uint groupId) public {
        Group storage g = groups[groupId];

        require(!g.isClosed, "Ja fechado");
        require(g.participants.length > 0, "Nenhum participante");
        require(
            msg.sender == g.creator || msg.sender == owner(),
            "Somente criador/owner"
        );
        require(
            block.timestamp >= g.deadline ||
            g.participants.length == g.maxParticipants,
            "Ainda ativo"
        );

        g.isClosed = true;

        uint randomIndex = uint(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    groupId
                )
            )
        ) % g.participants.length;

        address winner = g.participants[randomIndex];
        g.winner = winner;

        uint houseCut = (g.totalPrize * houseFeePercent) / 100;
        uint prize = g.totalPrize - houseCut;

        require(token.transfer(houseWallet, houseCut), "Falha pagamento casa");
        require(token.transfer(winner, prize), "Falha pagamento premio");

        emit GroupClosed(groupId, winner, prize);
    }

    function getGroupParticipants(uint groupId) external view returns (address[] memory) {
        return groups[groupId].participants;
    }

    receive() external payable {
        revert("Use buyTicket()");
    }
}
