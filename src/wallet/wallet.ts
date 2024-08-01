import { Address, getAddress, hexToBytes, stringToHex, encodeFunctionData } from "viem";
import { ethers } from "ethers";
import { Balance } from "./balance";
import { CartesiDAppAbi } from "./abi/CartesiDAppAbi";

export class Wallet {
  private accounts: Map<string, Balance> = new Map();

  private getOrCreateBalance(address: Address): Balance {
    const key = address.toLowerCase();
    if (!this.accounts.has(key)) {
      this.accounts.set(key, new Balance(address));
    }
    return this.accounts.get(key)!;
  }

  getBalance(address: Address): bigint {
    return this.getOrCreateBalance(address).getEther();
  }

  depositEther(payload: string): string {
    const [address, amount] = this.parseDepositPayload(payload);
    const balance = this.getOrCreateBalance(address);
    balance.increaseEther(amount);
    return JSON.stringify({ type: "etherDeposit", address, amount: amount.toString() });
  }

  withdrawEther(rollupAddress: Address, address: Address, amount: bigint): string {
    const balance = this.getOrCreateBalance(address);
    balance.decreaseEther(amount);
    const callData = this.encodeWithdrawCall(address, amount);
    return `Voucher: ${rollupAddress}, ${stringToHex(callData)}`;
  }

  transferEther(from: Address, to: Address, amount: bigint): string {
    const fromBalance = this.getOrCreateBalance(from);
    const toBalance = this.getOrCreateBalance(to);
    fromBalance.decreaseEther(amount);
    toBalance.increaseEther(amount);
    return JSON.stringify({ type: "etherTransfer", from, to, amount: amount.toString() });
  }

  private parseDepositPayload(payload: string): [Address, bigint] {
    const addressData = ethers.dataSlice(payload, 0, 20);
    const amountData = ethers.dataSlice(payload, 20, 52);
    if (!addressData) {
      throw new Error("Invalid deposit payload");
    }
    return [getAddress(addressData), BigInt(amountData)];
  }

  private encodeWithdrawCall(address: Address, amount: bigint): string {
    return encodeFunctionData({
      abi:CartesiDAppAbi,
      functionName: "withdrawEther",
      args: [address, amount],
    });
  }
}