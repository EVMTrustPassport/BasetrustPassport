# Base Trust Passport

### Your Wallet. Your Identity. Your Reputation.

Base Trust Passport is an on-chain Identity & Reputation layer built on the Base Mainnet.

Instead of measuring wallets only by balance or transaction count, Base Trust Passport analyzes on-chain behavior to generate a dynamic Trust Score, classify wallet reputation, issue Soulbound Passports, and unlock on-chain Credential NFTs.

The project transforms raw blockchain activity into a portable identity that applications and communities can understand.

---

# Why

Most blockchain wallets are anonymous.

A wallet that has existed for one year and consistently contributes to the ecosystem often looks identical to a newly created wallet.

Current explorers mainly display raw blockchain data:

* Transactions
* Tokens
* Contracts
* Gas

but they do not explain what that activity actually means.

As a result, applications have no standardized way to evaluate wallet reputation.

Base Trust Passport solves this problem by converting on-chain activity into an understandable identity profile.

---

# Solution

Base Trust Passport introduces a reputation layer composed of:

* Trust Score (0–1000)
* Passport Level
* Soulbound Passport NFT
* Credential NFTs
* Wallet Intelligence
* AI Wallet Analysis

Everything is generated directly from public blockchain data.

No personal information is required.

---

# Architecture

```
Wallet
      ↓
Explorer API
      ↓
Frontend Analytics Engine
      ↓
Trust Score (0-1000)
      ↓
Passport Level
      ↓
Passport NFT
      ↓
Credential NFTs
      ↓
Wallet Intelligence
```

The Trust Score is calculated entirely in the frontend using on-chain data fetched from the Explorer API.

Smart contracts are responsible only for issuing identity assets.

---

# Trust Score

Maximum score:

```
1000
```

Current scoring model:

| Category  | Max Score |
| --------- | --------- |
| Identity  | 250       |
| Activity  | 350       |
| Economic  | 300       |
| Diversity | 100       |

The Trust Score evaluates:

* Wallet Age
* Active Days
* Transaction Count
* Gas Usage
* Transfer Volume
* Contract Diversity

The score updates automatically whenever the wallet activity changes.

---

# Passport NFT

Each wallet can mint exactly one Passport NFT.

The Passport is Soulbound and represents the wallet's permanent identity.

Features:

* One Passport per wallet
* Soulbound
* Passport ID
* Passport Level
* Dynamic identity representation

---

# Credential NFTs

Credential NFTs recognize important milestones in a wallet's reputation.

Unlock requirements:

| Credential  | Trust Score |
| ----------- | ----------: |
| Explorer    |         200 |
| Contributor |         500 |
| Builder     |         800 |
| OG          |         950 |

Credentials can only be claimed after reaching the required Trust Score.

---

# Wallet Intelligence

Beyond numerical scores, the platform analyzes wallet behavior.

Current analytics include:

* Wallet Analytics
* Monthly Activity
* Monthly Transactions
* ETH Transfers
* New User Statistics
* Wallet Heatmap
* Wallet DNA
* Wallet Intelligence Report

All visualizations are generated using real Explorer transaction history.

---

# AI Wallet Analysis

The AI dashboard summarizes wallet reputation into understandable insights.

Current analysis includes:

* Trust Class
* Risk Signal
* AI Confidence
* Wallet DNA
* Personalized Recommendations

Recommendations are generated dynamically based on wallet activity instead of relying on fixed thresholds.

---

# Learn Integration

The project also researched integration with the official IOPN Learn platform.

The Learn API has been reverse engineered, including:

* User Progress
* User Level
* Lesson Information
* Token Verification

However, the current Learn platform authenticates users using Session Cookies instead of wallet authentication.

Because Trust Passport runs on a separate domain, browser security prevents automatic synchronization.

The integration module is therefore included but currently waits for an official public API from the IOPN Core Team.

---

# Technology Stack

Frontend

* HTML
* CSS
* JavaScript
* Ethers.js

Blockchain

* Solidity
* Hardhat
* Base Mainnet

Data

* IOPN Explorer API

---

# Smart Contracts

Passport NFT

* Soulbound Passport
* One Passport per Wallet

Credential NFT

* Reputation Credentials
* Explorer
* Contributor
* Builder
* OG

---

# Current Features

✅ Trust Score Engine

✅ Passport NFT

✅ Credential NFTs

✅ Wallet Analytics

✅ Wallet Intelligence

✅ AI Wallet Report

✅ AI Recommendations

✅ Wallet Heatmap

✅ Learn Integration Module

---

# Future Roadmap

* Dynamic Passport Metadata
* Dynamic Credential Metadata
* Explorer NFT Image Support
* Wallet Intelligence Improvements
* Official Learn API Integration
* Ecosystem Reputation Expansion

---

# Vision

Base Trust Passport aims to become the identity layer of the IBase ecosystem.

Instead of wallets being represented only by addresses, every wallet can have a measurable reputation, verifiable credentials, and a portable on-chain identity that any decentralized application can recognize.
