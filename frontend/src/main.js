
import { ethers } from "ethers";
import "./style.css";

let provider;
let signer;
let userAddress;

let passportContract;
let credentialContract;
let levelNFTContract;

let walletConnectInProgress = false;


let walletSessionVersion = 0;
let walletViewVersion = 0;
let analyticsRequestVersion = 0;

function beginWalletSession() {
  walletSessionVersion += 1;
  walletViewVersion += 1;
  return walletSessionVersion;
}

function beginWalletView() {
  walletViewVersion += 1;
  return walletViewVersion;
}

function isCurrentWalletSession(
  sessionVersion,
  walletAddress
) {
  return (
    sessionVersion === walletSessionVersion &&
    Boolean(userAddress) &&
    Boolean(walletAddress) &&
    userAddress.toLowerCase() ===
      walletAddress.toLowerCase()
  );
}

function isCurrentWalletView(
  sessionVersion,
  walletAddress,
  viewVersion
) {
  return (
    viewVersion === walletViewVersion &&
    isCurrentWalletSession(
      sessionVersion,
      walletAddress
    )
  );
}



function parseBoundedInteger(
  rawValue,
  fallback,
  min,
  max
) {
  const parsed = Number.parseInt(
    String(rawValue ?? ""),
    10
  );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, parsed)
  );
}

async function fetchJsonWithTimeout(
  url,
  options = {},
  timeoutMs = API_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Request failed: HTTP ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Request timed out after ${timeoutMs}ms`
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getBlockscoutAddressHash(value) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value.hash === "string"
  ) {
    return value.hash;
  }

  if (
    value &&
    typeof value.address === "string"
  ) {
    return value.address;
  }

  return null;
}

function isSuccessfulBlockscoutTransaction(tx) {
  if (tx?.success === true) {
    return true;
  }

  if (tx?.success === false) {
    return false;
  }

  const status = String(
    tx?.status ?? ""
  ).toLowerCase();

  return (
    status === "ok" ||
    status === "success" ||
    status === "1" ||
    status === "true"
  );
}

function isOutgoingTransaction(tx, walletAddress) {
  const fromAddress =
    getBlockscoutAddressHash(tx?.from);

  return (
    typeof fromAddress === "string" &&
    fromAddress.toLowerCase() ===
      walletAddress.toLowerCase()
  );
}

function isSelfDirectedTransaction(
  tx,
  walletAddress
) {
  const toAddress =
    getBlockscoutAddressHash(tx?.to);

  return (
    typeof toAddress === "string" &&
    toAddress.toLowerCase() ===
      walletAddress.toLowerCase()
  );
}

function getTransactionTimestamp(tx) {
  const rawTimestamp =
    tx?.timestamp ||
    tx?.timeStamp ||
    tx?.created_at ||
    tx?.block_timestamp;

  if (!rawTimestamp) {
    return null;
  }

  const date = new Date(rawTimestamp);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function getTransactionHash(tx) {
  return typeof tx?.hash === "string"
    ? tx.hash.toLowerCase()
    : null;
}

function deduplicateTransactions(
  transactions = []
) {
  const seenHashes = new Set();
  const result = [];

  for (const tx of transactions) {
    const hash = getTransactionHash(tx);

    if (hash) {
      if (seenHashes.has(hash)) {
        continue;
      }

      seenHashes.add(hash);
    }

    result.push(tx);
  }

  return result;
}

function capTransactionsPerDay(
  transactions,
  dailyLimit
) {
  const countByDay = new Map();
  const result = [];

  for (const tx of transactions) {
    const date = getTransactionTimestamp(tx);

    if (!date) {
      continue;
    }

    const dayKey = date
      .toISOString()
      .slice(0, 10);

    const currentCount =
      countByDay.get(dayKey) || 0;

    if (currentCount >= dailyLimit) {
      continue;
    }

    countByDay.set(
      dayKey,
      currentCount + 1
    );

    result.push(tx);
  }

  return result;
}

function weiToEtherNumber(rawValue) {
  try {
    const value = BigInt(
      String(rawValue ?? "0")
    );

    return Number(
      ethers.formatEther(value)
    );
  } catch {
    return 0;
  }
}

function beginAnalyticsRequest(
  tabName,
  loadingMessage
) {
  analyticsRequestVersion += 1;
  setAnalyticsActiveTab(tabName);
  showChartLoading(loadingMessage);

  return analyticsRequestVersion;
}

function isCurrentAnalyticsRequest(
  requestVersion,
  tabName
) {
  const activeTab = document.querySelector(
    ".analytics-tab.active"
  );

  return (
    requestVersion ===
      analyticsRequestVersion &&
    activeTab?.dataset.tab === tabName
  );
}

const BASE_CHAIN_ID = "0x2105"; // 8453
const BASE_CHAIN_ID_DECIMAL = 8453;
const BASE_NETWORK_NAME = "Base Mainnet";

const BASE_RPC = (
  import.meta.env.VITE_BASE_RPC_URL ||
  "https://mainnet.base.org"
).trim().replace(/\/+$/, "");

const BASE_EXPLORER = (
  import.meta.env.VITE_BASE_EXPLORER_URL ||
  "https://base.blockscout.com"
).trim().replace(/\/+$/, "");

const BLOCKSCOUT_API = (
  import.meta.env.VITE_BASE_BLOCKSCOUT_API_URL ||
  "https://base.blockscout.com/api/v2"
).trim().replace(/\/+$/, "");

const BASE_STATS_API = (
  import.meta.env.VITE_BASE_STATS_API_URL ||
  "/base-stats"
).trim().replace(/\/+$/, "");

const API_REQUEST_TIMEOUT_MS = parseBoundedInteger(
  import.meta.env.VITE_API_REQUEST_TIMEOUT_MS,
  15000,
  3000,
  60000
);

const MAX_BASE_TRANSACTIONS = parseBoundedInteger(
  import.meta.env.VITE_MAX_BASE_TRANSACTIONS,
  3000,
  100,
  10000
);

const MAX_ETHEREUM_TRANSACTIONS = parseBoundedInteger(
  import.meta.env.VITE_MAX_ETHEREUM_TRANSACTIONS,
  2000,
  100,
  5000
);

const MAX_SCORING_TX_PER_DAY = parseBoundedInteger(
  import.meta.env.VITE_MAX_SCORING_TX_PER_DAY,
  10,
  1,
  50
);

const levels = [
  { level: 1, name: "New Identity", min: 0 },
  { level: 2, name: "Verified Wallet", min: 100 },
  { level: 3, name: "Explorer", min: 200 },
  { level: 4, name: "Active Explorer", min: 300 },
  { level: 5, name: "Contributor", min: 400 },
  { level: 6, name: "Builder", min: 500 },
  { level: 7, name: "Advanced Builder", min: 600 },
  { level: 8, name: "Leader", min: 700 },
  { level: 9, name: "Elite", min: 800 },
  { level: 10, name: "Legend", min: 900 },
];

const PASSPORT_ADDRESS = (
  import.meta.env.VITE_PASSPORT_ADDRESS || ""
).trim();

const CREDENTIAL_ADDRESS = (
  import.meta.env.VITE_CREDENTIAL_ADDRESS || ""
).trim();

const LEVEL_NFT_ADDRESS = (
  import.meta.env.VITE_LEVEL_NFT_ADDRESS || ""
).trim();
const PASSPORT_ABI = [
  "function mintPassport() payable returns (uint256 tokenId)",
  "function mintFee() view returns (uint256)",
  "function hasPassport(address wallet) view returns (bool)",
  "function passportOf(address wallet) view returns (uint256)",
  "function trustScoreOf(address wallet) view returns (uint256)",
  "function levelOf(address wallet) view returns (uint8)",
  "function passportNumberOf(uint256 tokenId) view returns (uint256)",
  "function passportNumberOfWallet(address wallet) view returns (uint256)",
  "function passportFullDataOf(address wallet) view returns (uint256 tokenId,uint256 passportNumber,uint256 trustScore,uint8 level,uint64 mintedAt,uint64 updatedAt)",
  "function isPassportNumberUsed(uint256 passportNumber) view returns (bool)",
];

const CREDENTIAL_ABI = [
  "function claimCredential(uint256 credentialId) payable",
  "function claimFee() view returns (uint256)",
  "function hasClaimed(address wallet,uint256 credentialId) view returns (bool)",
  "function canClaim(address wallet,uint256 credentialId) view returns (bool eligible,string reason)",
  "function credentialThreshold(uint256 credentialId) view returns (uint256)",

  "function balanceOf(address account,uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts,uint256[] ids) view returns (uint256[])",
  "function setApprovalForAll(address operator,bool approved)",
  "function isApprovedForAll(address account,address operator) view returns (bool)",
  "function safeTransferFrom(address from,address to,uint256 id,uint256 value,bytes data)",
  "function safeBatchTransferFrom(address from,address to,uint256[] ids,uint256[] values,bytes data)",

  "event CredentialClaimed(address indexed wallet,uint256 indexed credentialId,uint256 feePaid)",
  "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
  "event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
  "event ApprovalForAll(address indexed account,address indexed operator,bool approved)",
];

const LEVEL_NFT_ABI = [
  "function claimLevel(uint256 levelId) payable",
  "function claimFee() view returns (uint256)",
  "function hasClaimed(address wallet,uint256 levelId) view returns (bool)",
  "function canClaim(address wallet,uint256 levelId) view returns (bool eligible,string reason)",
  "function highestClaimedLevel(address wallet) view returns (uint256)",
  "function claimedLevelCount(address wallet) view returns (uint256)",

  "function balanceOf(address account,uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts,uint256[] ids) view returns (uint256[])",
  "function setApprovalForAll(address operator,bool approved)",
  "function isApprovedForAll(address account,address operator) view returns (bool)",
  "function safeTransferFrom(address from,address to,uint256 id,uint256 value,bytes data)",
  "function safeBatchTransferFrom(address from,address to,uint256[] ids,uint256[] values,bytes data)",

  "event LevelNFTClaimed(address indexed wallet,uint256 indexed levelId,uint256 feePaid)",
  "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
  "event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
  "event ApprovalForAll(address indexed account,address indexed operator,bool approved)",
];

document.querySelector("#app").innerHTML = `
  <div class="app-shell">
    <nav class="topbar">
      <div class="brand">
        <div class="brand-mark">◆ Base Trust Passport ◆</div>       
        
      </div>
  
      <div class="nav-links">
        <a href="#dashboard">Dashboard</a>
        <a href="#levels">Passport Levels</a>
        <a href="#analytics">Analytics</a>
        <a href="#walletIntelligence">Wallet Intelligence</a>
      </div>

      <div class="wallet-actions">

    <div class="network-pill">
      <span class="network-dot"></span>
      Base Mainnet
      </div>

      <button id="connectBtn" class="connect-btn">
        Connect Wallet
      </button>

    </div>
    </nav>

    <main id="dashboard" class="container">
      <section class="hero-grid">
        <div class="mint-card panel">
          <p class="eyebrow">Mint your Passport</p>

<div class="passport-image-wrapper">

    <div class="passport-shine"></div>

    <img
        src="/passport-template.png"
        class="passport-template"
    >

            <div class="passport-overlay">
              <div class="passport-label passport-label-id">PASSPORT ID</div>
              <div id="passportOverlayId">Not Verified</div>

              <div class="passport-label passport-label-level">LEVEL</div>

                <div id="passportOverlayLevel" class="passport-level-line">
                  <span id="passportOverlayLevelValue">---</span>
                  <span id="passportOverlayLevelName"></span>
                </div>

              <div class="passport-label passport-label-score">TRUST SCORE</div>
              <div id="passportOverlayScore">---</div>

              <div class="passport-progress">
                <div id="passportProgressFill"></div>
              </div>
            </div>
          </div>

          <p class="small">
            Your passport level is calculated from real Base on-chain history.
          </p>
          <button id="mintBtn" class="primary-btn" onclick="mintPassport()">
            Mint Passport
          </button>
    
          <button
            id="sharePassportBtn"
            class="share-passport-btn"
            type="button"
            hidden
          >
            <span class="share-passport-icon">𝕏</span>
            Share Your Passport
          </button>

        </div>

        <div class="main-card panel">
          <div class="title-row">
            <div>
              <h1>Base Trust Passport</h1>
              <p>Your Wallet. Your Credentials. Your Reputation.</p>
            </div>
            <div class="powered">BUILT ON <b>BASE</b></div>
          </div>

        <div class="trust-score-card">

          <div class="trust-score-top">
            <span>Trust Score</span>
            <span id="passportLevel">Level --</span>
          </div>

          <div class="trust-score-number">
            <span id="trustScore">---</span>
            <small>/1000</small>
          </div>

          <div class="score-breakdown">
            <div>
              <span>Identity</span>
              <b id="identityScore">---/250</b>
            </div>

            <div>
              <span>Activity</span>
              <b id="activityScore">---/350</b>
            </div>

            <div>
              <span>Economic</span>
              <b id="economicScore">---/300</b>
            </div>

            <div>
              <span>Diversity</span>
              <b id="diversityScore">---/100</b>
            </div>
          </div>

        </div>

          <div class="button-row">
            <button id="analyzeBtn" class="primary-btn">Analyze Wallet</button>
            <button id="openTrustModal" class="secondary-btn">How to build trust</button>
          </div>

          <div class="passport-seal">
            <div class="seal-title">
             🛡 VERIFIED ON BASE
            </div>

            <div class="seal-subtitle">
              Soulbound Identity Passport
            </div>

            <div class="seal-divider"></div>

            <div class="seal-items">
              <span>✓ Tamper Resistant</span>
              <span>✓ On-Chain Verified</span>
              <span>✓ Reputation Secured</span>
            </div>
          </div>

        </div>

        <div class="side-stack">
          <div class="panel side-card">
            <span>YOUR BASE WALLET ADDRESS IS</span>
            <strong id="walletText">Not Connected</strong>
            <p>Your unique identity in the Base ecosystem</p>
          </div>

          <div class="panel side-card credential-panel">
            <section class="credential-content">
              <h2>On-Chain Credentials</h2>
              <div id="credentialList" class="credential-list"></div>
            </section>              
          </div>
        </div>
      </section>

      <section id="levels" class="section">
        <h2>Base Reputation Passport Levels</h2>
        <div class="panel level-panel">
          <div class="level-head">
            <div>
              <h3>My Level <span id="myLevel">--</span></h3>
              <p>Up to the next level: <span id="nextLevelPoints">--</span> Points</p>
            </div>
          </div>
          <div id="levelCards" class="level-cards"></div>
        </div>
      </section>

      <section class="stats-grid">
        <div class="stat panel">
          <strong id="networkWallets">---</strong>
          <span>Wallets in the network</span>
        </div>
        <div class="stat panel">
          <strong id="networkTx">---</strong>
          <span>Transactions in the network</span>
        </div>
       <div class="stat panel">
          <strong id="networkBlocks">---</strong>
          <span>Blocks Produced</span>
        </div>
      </section>

      <section id="analytics" class="analytics-grid">
        <div class="panel chart-panel">
          <div class="chart-card">
           
          <div class="analytics-tabs">
            <button
              class="analytics-tab active"
              data-tab="tx"
              onclick="loadMonthlyTransactions()"
            >
              Transactions
            </button>

            <button
              class="analytics-tab"
              data-tab="newUsers"
              onclick="loadMonthlyNewUsers()"
            >
              New Addresses
            </button>

            <button
              class="analytics-tab"
              data-tab="walletAge"
              onclick="loadTotalAddresses()"
            >
              Total Addresses
            </button>

            <button
              class="analytics-tab"
              data-tab="ethTransfers"
              onclick="loadMonthlyETHTransfers()"
            >
              ETH Transfers
            </button>

            <button class="analytics-tab"
                    data-tab="tvl"
                    onclick="loadTVL()">
              TVL
            </button>

            <button class="analytics-tab"
                    data-tab="gasPrice"
                    onclick="loadGasPrice()">
              Avg Gas Price
            </button>

            <button
              class="analytics-tab"
              data-tab="gasUsed"
              onclick="loadDailyGasUsed()"
            >
              Daily Gas Used
            </button>
          </div>           

            <div id="monthlyActiveWalletChart" class="monthly-wallet-chart"></div>
          </div>      
        </div>

        <div class="panel metric-table">
          <h3>On-chain Reputation Metrics</h3>
          <div class="metric-row"><span>Wallet Age</span><b id="walletAge">0 days</b></div>
          <div class="metric-row"><span>Active Days</span><b id="activeDays">0</b></div>
          <div class="metric-row"><span>Total Transactions</span><b id="txCount">0</b></div>
          <div class="metric-row"><span>Contracts Used</span><b id="contractsUsed">0</b></div>
          <div class="metric-row"><span>Gas Fee Spent</span><b id="gasSpent">0 ETH</b></div>
          <div class="metric-row"><span>Total Volume</span><b id="totalVolume">0 ETH</b></div>
        </div>
      </section>


        <section id="walletIntelligence" class="wallet-intelligence-section">
          <div class="section-head">
            <div>
              <h2>Wallet Intelligence</h2>
            </div>
            <span id="aiConfidence" class="ai-confidence">AI Confidence 0%</span>
          </div>

          <div class="wallet-intelligence-grid">
            <div class="ai-report-card">
              <div class="ai-card-title">🤖 AI Wallet Report</div>
              <p id="aiWalletReport">
                Connect your wallet and analyze your on-chain history to generate an intelligence report.
              </p>

              <div class="ai-trust-row">
                <span>Trust Classification</span>
                <b id="aiTrustClass">Not analyzed</b>
              </div>

              <div class="ai-trust-row">
                <span>Risk Signal</span>
                <b id="aiRiskSignal">Unknown</b>
              </div>
            </div>

            <div class="ai-report-card">
              <div class="ai-card-title">🎯 Recommended Actions</div>
              <div id="aiRecommendations" class="ai-recommendations">
                <p>Analyze your wallet to receive personalized trust-building actions.</p>
              </div>
            </div>

            <div class="ai-report-card">
              <div class="ai-card-title">🧬 Wallet DNA</div>

              <div class="dna-row">
                <span>Identity</span>
                <div class="dna-bar"><i id="dnaIdentity"></i></div>
              </div>

              <div class="dna-row">
                <span>Activity</span>
                <div class="dna-bar"><i id="dnaActivity"></i></div>
              </div>

              <div class="dna-row">
                <span>Economic</span>
                <div class="dna-bar"><i id="dnaEconomic"></i></div>
              </div>

              <div class="dna-row">
                <span>Diversity</span>
                <div class="dna-bar"><i id="dnaDiversity"></i></div>
              </div>
            </div>



            <div class="ai-report-card heatmap-card">
              <div class="heatmap-top">
                <div>
                  <div class="ai-card-title">🔥 Wallet Heatmap</div>
                  <p class="heatmap-subtitle">
                    Recent on-chain activity pattern
                  </p>
                </div>

                <div class="heatmap-legend">
                  <span>Less</span>
                  <i class="level-0"></i>
                  <i class="level-1"></i>
                  <i class="level-2"></i>
                  <i class="level-3"></i>
                  <i class="level-4"></i>
                  <span>More</span>
                </div>
              </div>

              <div id="walletHeatmapWrapper">

                <div id="heatmapPlaceholder" class="heatmap-placeholder">
                  <div class="heatmap-placeholder-icon">📊</div>

                  <h3>No Wallet Connected</h3>

                  <p>
                    Connect your wallet to generate a real-time activity calendar
                    based on your on-chain transaction history.
                  </p>
                </div>

                <div id="heatmapContent" class="hidden">

                  <div class="activity-calendar">
                    <div class="calendar-days">
                      <span></span>
                      ${Array.from({ length: 31 }, (_, i) => `<b>${i + 1}</b>`).join("")}
                    </div>

                    <div id="walletHeatmap" class="wallet-heatmap"></div>
                  </div>

                  <p class="heatmap-explain">
                    Each row is a month. Each square represents one day of wallet activity.
                  </p>

                </div>

              </div>
          </div>

             
        </section>

    </main>
  </div>

  <div id="trustModal" class="trust-modal">
  <div class="trust-modal-box">
    <button id="closeTrustModal" class="trust-modal-close">×</button>

    <h2>Build Trust. Unlock Your Base Identity.</h2>

    <p>
      Your Trust Score is calculated from verifiable on-chain activity across the Base ecosystem.
    </p>

    <div class="trust-modal-grid">
      <div>
        <h3>Identity</h3>
        <p>Wallet age and long-term identity history.</p>
      </div>

      <div>
        <h3>Activity</h3>
        <p>Active days, transactions, and consistency.</p>
      </div>

      <div>
        <h3>Economic</h3>
        <p>ETH Transfers, volume, and gas spent.</p>
      </div>

      <div>
        <h3>Diversity</h3>
        <p>Interactions with different smart contracts.</p>
      </div>
    </div>

    <div class="credential-rules">
      <h3>Credential Requirements</h3>
      <p><span>Explorer</span><b>100</b></p>
      <p><span>Contributor</span><b>300</b></p>
      <p><span>Builder</span><b>600</b></p>
      <p><span>Legend</span><b>900</b></p>
    </div>

    <p class="trust-note">
      Reputation is built on real on-chain activity, not transaction spam.
    </p>
  </div>
</div>
`;


renderCredentials(0);
renderLevelCards(0);
loadNetworkStats();
loadMonthlyTransactions();

document.getElementById("connectBtn").onclick = connectWallet;
document.getElementById("analyzeBtn").onclick = analyzeWallet;
if (window.ethereum) {
  window.ethereum.on(
    "accountsChanged",
    handleAccountsChanged
  );

  window.ethereum.on(
    "chainChanged",
    handleChainChanged
  );
}

function hasMainnetPassportContract() {
  return (
    ethers.isAddress(PASSPORT_ADDRESS) &&
    ethers.isAddress(CREDENTIAL_ADDRESS) &&
    ethers.isAddress(LEVEL_NFT_ADDRESS)
  );
}

function getConfiguredMainnetContracts() {
  const entries = [
    ["Passport", PASSPORT_ADDRESS],
    ["Credential", CREDENTIAL_ADDRESS],
    ["Level NFT", LEVEL_NFT_ADDRESS],
  ];

  const configured = {};

  for (const [label, address] of entries) {
    if (!ethers.isAddress(address)) {
      throw new Error(
        `${label} Mainnet address is not configured. Set the matching VITE_*_ADDRESS variable.`
      );
    }

    configured[label] =
      ethers.getAddress(address);
  }

  return {
    passport: configured.Passport,
    credential: configured.Credential,
    levelNFT: configured["Level NFT"],
  };
}

async function assertMainnetContractsDeployed(
  providerSnapshot,
  addresses
) {
  const entries = [
    ["Passport", addresses.passport],
    ["Credential", addresses.credential],
    ["Level NFT", addresses.levelNFT],
  ];

  const codeResults = await Promise.all(
    entries.map(([, address]) =>
      providerSnapshot.getCode(address)
    )
  );

  entries.forEach(([label, address], index) => {
    const code = codeResults[index];

    if (!code || code === "0x") {
      throw new Error(
        `${label} contract is not deployed at ${address} on Base Mainnet`
      );
    }
  });
}

async function initializeWalletState(address = null) {
  if (!window.ethereum) {
    throw new Error(
      "Please install MetaMask or another EVM wallet"
    );
  }

  const sessionVersion = beginWalletSession();

  const nextProvider = new ethers.BrowserProvider(
    window.ethereum
  );

  const network = await nextProvider.getNetwork();

  if (
    Number(network.chainId) !==
    BASE_CHAIN_ID_DECIMAL
  ) {
    throw new Error(
      `Wallet is not connected to ${BASE_NETWORK_NAME}`
    );
  }

  const configuredContracts =
    getConfiguredMainnetContracts();

  await assertMainnetContractsDeployed(
    nextProvider,
    configuredContracts
  );

  if (sessionVersion !== walletSessionVersion) {
    return null;
  }

  const nextSigner = await nextProvider.getSigner();
  const signerAddress = ethers.getAddress(
    await nextSigner.getAddress()
  );

  const requestedAddress = address
    ? ethers.getAddress(address)
    : signerAddress;

  if (
    signerAddress.toLowerCase() !==
    requestedAddress.toLowerCase()
  ) {
    throw new Error(
      "Selected wallet account does not match the active signer"
    );
  }

  const nextPassportContract = new ethers.Contract(
    configuredContracts.passport,
    PASSPORT_ABI,
    nextSigner
  );

  const nextCredentialContract = new ethers.Contract(
    configuredContracts.credential,
    CREDENTIAL_ABI,
    nextSigner
  );

  const nextLevelNFTContract = new ethers.Contract(
    configuredContracts.levelNFT,
    LEVEL_NFT_ABI,
    nextSigner
  );

  if (sessionVersion !== walletSessionVersion) {
    return null;
  }

  provider = nextProvider;
  signer = nextSigner;
  userAddress = signerAddress;

  passportContract = nextPassportContract;
  credentialContract = nextCredentialContract;
  levelNFTContract = nextLevelNFTContract;

  const walletSnapshot = signerAddress;
  const shortWallet = shortAddress(walletSnapshot);

  setText("walletText", shortWallet);

  const connectBtn =
    document.getElementById("connectBtn");

  const analyzeBtn =
    document.getElementById("analyzeBtn");

  const mintBtn =
    document.getElementById("mintBtn");

  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.innerText = `● ${shortWallet}`;
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
  }

  if (mintBtn) {
    mintBtn.disabled = true;
    mintBtn.innerText = "Loading Passport...";
  }

  document
    .querySelector(".network-pill")
    ?.classList.add("online");

  try {
    const passportState =
      await refreshWalletOnchainState({
        sessionVersion,
        walletAddress: walletSnapshot,
        provider: nextProvider,
        passportContract: nextPassportContract,
        credentialContract: nextCredentialContract,
        levelNFTContract: nextLevelNFTContract,
      });

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletSnapshot
      )
    ) {
      return null;
    }

    await analyzeWallet({
      sessionVersion,
      walletAddress: walletSnapshot,
      provider: nextProvider,
      passportContract: nextPassportContract,
      credentialContract: nextCredentialContract,
      levelNFTContract: nextLevelNFTContract,
      passportState,
      silent: true,
    });

    return {
      sessionVersion,
      walletAddress: walletSnapshot,
    };
  } finally {
    if (
      isCurrentWalletSession(
        sessionVersion,
        walletSnapshot
      )
    ) {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.innerText = `● ${shortWallet}`;
      }

      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.innerText = "Analyze Wallet";
      }
    }
  }
}

async function handleAccountsChanged(accounts) {
  if (walletConnectInProgress) {
    return;
  }

  if (
    !Array.isArray(accounts) ||
    accounts.length === 0
  ) {
    resetWalletState();
    return;
  }

  let nextAddress;

  try {
    nextAddress = ethers.getAddress(accounts[0]);
  } catch (error) {
    console.error("Invalid wallet account:", error);
    resetWalletState();
    return;
  }

  if (
    userAddress &&
    nextAddress.toLowerCase() ===
      userAddress.toLowerCase()
  ) {
    return;
  }

  resetWalletState();

  try {
    await initializeWalletState(nextAddress);
  } catch (error) {
    console.error(
      "Wallet account change failed:",
      error
    );

    resetWalletState();

    alert(
      error?.shortMessage ||
      error?.message ||
      "Could not load the selected wallet"
    );
  }
}
function handleChainChanged(chainId) {
  if (chainId !== BASE_CHAIN_ID) {
    resetWalletState();

    alert(
      "Please switch to Base Mainnet"
    );

    return;
  }

  beginWalletSession();
  window.location.reload();
}

function resetWalletState() {
  beginWalletSession();

  provider = undefined;
  signer = undefined;
  userAddress = undefined;

  passportContract = undefined;
  credentialContract = undefined;
  levelNFTContract = undefined;

  const connectBtn =
    document.getElementById("connectBtn");

  const analyzeBtn =
    document.getElementById("analyzeBtn");

  const mintBtn =
    document.getElementById("mintBtn");

  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.innerText = "Connect Wallet";
  }

  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.innerText = "Analyze Wallet";
  }

  if (mintBtn) {
    mintBtn.innerText = "Mint Passport";
    mintBtn.disabled = false;
    mintBtn.classList.remove("minted");
  }

  setText("walletText", "Not Connected");
  setText("trustScore", "---");
  setText("passportLevel", "Level --");

  setText("passportOverlayId", "Not Verified");
  setText("passportOverlayLevelValue", "---");
  setText("passportOverlayLevelName", "");
  setText("passportOverlayScore", "---");

  setText("myLevel", "--");
  setText("nextLevelPoints", "--");

  setText("walletAge", "0 days");
  setText("activeDays", "0");
  setText("txCount", "0");
  setText("contractsUsed", "0");
  setText("gasSpent", "0 ETH");
  setText("totalVolume", "0 ETH");

  setText("identityScore", "---/250");
  setText("activityScore", "---/350");
  setText("economicScore", "---/300");
  setText("diversityScore", "---/100");

  setText("aiConfidence", "AI Confidence 0%");
  setText("aiTrustClass", "Not analyzed");
  setText("aiRiskSignal", "Unknown");
  setText(
    "aiWalletReport",
    "Connect your wallet and analyze your on-chain history to generate an intelligence report."
  );

  const recommendationBox =
    document.getElementById("aiRecommendations");

  if (recommendationBox) {
    recommendationBox.innerHTML =
      "<p>Analyze your wallet to receive personalized trust-building actions.</p>";
  }

  for (const id of [
    "dnaIdentity",
    "dnaActivity",
    "dnaEconomic",
    "dnaDiversity",
  ]) {
    const bar = document.getElementById(id);
    if (bar) bar.style.width = "0%";
  }

  const progressFill =
    document.getElementById(
      "passportProgressFill"
    );

  if (progressFill) {
    progressFill.style.width = "0%";
  }

  const heatmap =
    document.getElementById("walletHeatmap");

  const heatmapPlaceholder =
    document.getElementById(
      "heatmapPlaceholder"
    );

  const heatmapContent =
    document.getElementById(
      "heatmapContent"
    );

  if (heatmap) {
    heatmap.innerHTML = "";
  }

  if (heatmapPlaceholder) {
    heatmapPlaceholder.style.display = "block";
  }

  if (heatmapContent) {
    heatmapContent.style.display = "none";
  }

  document
    .querySelector(".network-pill")
    ?.classList.remove("online");
  updateSharePassportButton(false);
  renderCredentials(0);
  renderLevelCards(0);
  updatePassportLevelTheme(1);
}
async function connectWallet() {
  if (!window.ethereum) {
    alert(
      "Please install MetaMask or another EVM wallet"
    );
    return;
  }

  if (walletConnectInProgress) {
    return;
  }

  const connectBtn =
    document.getElementById("connectBtn");

  walletConnectInProgress = true;

  try {
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.innerText = "Connecting...";
    }

    await switchToBaseMainnet();

    const currentChainId =
      await window.ethereum.request({
        method: "eth_chainId",
      });

    if (currentChainId !== BASE_CHAIN_ID) {
      throw new Error(
        "Wallet is not connected to Base Mainnet"
      );
    }

    const accounts =
      await window.ethereum.request({
        method: "eth_requestAccounts",
      });

    if (
      !Array.isArray(accounts) ||
      accounts.length === 0
    ) {
      throw new Error(
        "No wallet account was selected"
      );
    }

    resetWalletState();
    await initializeWalletState(accounts[0]);
  } catch (error) {
    console.error(
      "Connect wallet failed:",
      error
    );

    resetWalletState();

    alert(
      error?.shortMessage ||
      error?.message ||
      "Could not connect wallet"
    );
  } finally {
    walletConnectInProgress = false;

    if (connectBtn) {
      connectBtn.disabled = false;

      if (!userAddress) {
        connectBtn.innerText =
          "Connect Wallet";
      }
    }
  }
}

async function switchToBaseMainnet() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID }],
    });
  } catch (error) {
    if (error?.code !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_CHAIN_ID,
          chainName: BASE_NETWORK_NAME,
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: [BASE_RPC],
          blockExplorerUrls: [BASE_EXPLORER],
        },
      ],
    });
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}
function updateSharePassportButton(hasPassport) {
  const shareBtn =
    document.getElementById("sharePassportBtn");

  if (!shareBtn) return;

  shareBtn.hidden = !hasPassport;
}

function sharePassport() {
  const passportId =
    document
      .getElementById("passportOverlayId")
      ?.innerText
      ?.trim() || "Base Trust Passport";

  const levelValue =
    document
      .getElementById(
        "passportOverlayLevelValue"
      )
      ?.innerText
      ?.trim() || "";

  const levelName =
    document
      .getElementById(
        "passportOverlayLevelName"
      )
      ?.innerText
      ?.trim() || "";

  const trustScore =
    document
      .getElementById("passportOverlayScore")
      ?.innerText
      ?.trim() || "0";

  const projectUrl =
    "https://evmtrustpassport.xyz";

  const levelText =
    `${levelValue} ${levelName}`.trim();

  const postText = [
    "I just minted my Base Trust Passport on @base 🔵",
    "",
    `Passport: ${passportId}`,
    levelText
      ? `Level: ${levelText}`
      : "",
    `Trust Score: ${trustScore}/1000`,
    "",
    "Build your on-chain identity and reputation:",
    projectUrl,
    "",
    "#Base #OnchainIdentity #EVMTrustPassport",
  ]
    .filter(
      (line, index, lines) =>
        line !== "" ||
        lines[index - 1] !== ""
    )
    .join("\n");

  const xShareUrl =
    `https://x.com/intent/post?text=${encodeURIComponent(
      postText
    )}`;

  window.open(
    xShareUrl,
    "_blank",
    "noopener,noreferrer"
  );
}

document
  .getElementById("sharePassportBtn")
  ?.addEventListener(
    "click",
    sharePassport
  );

async function analyzeWallet(options = {}) {
  const walletAddress =
    options.walletAddress ?? userAddress;

  const sessionVersion =
    options.sessionVersion ?? walletSessionVersion;

  const providerSnapshot =
    options.provider ?? provider;

  const passportContractSnapshot =
    options.passportContract ?? passportContract;

  const credentialContractSnapshot =
    options.credentialContract ?? credentialContract;

  const levelNFTContractSnapshot =
    options.levelNFTContract ?? levelNFTContract;

  const silent = Boolean(options.silent);

  if (!walletAddress) {
    if (!silent) {
      alert("Connect wallet first");
    }

    return null;
  }

  const analyzeBtn =
    document.getElementById("analyzeBtn");

  try {
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.innerText = "Analyzing...";
    }


    const result =
      await calculateTrustScore(walletAddress);

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return null;
    }


    let passportState =
      options.passportState ?? null;

    if (
      !passportState &&
      providerSnapshot &&
      passportContractSnapshot &&
      credentialContractSnapshot &&
      levelNFTContractSnapshot
    ) {
      passportState =
        await refreshWalletOnchainState({
          sessionVersion,
          walletAddress,
          provider: providerSnapshot,
          passportContract:
            passportContractSnapshot,
          credentialContract:
            credentialContractSnapshot,
          levelNFTContract:
            levelNFTContractSnapshot,
        });
    }

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return null;
    }

    const hasMintedPassport =
      passportState?.hasPassport === true;
    updateSharePassportButton(
      hasMintedPassport
    );
    const dashboardScore = Math.max(
      0,
      Math.min(
        1000,
        Number(result.trustScore) || 0
      )
    );

    const dashboardLevel =
      getPassportLevel(dashboardScore);


    setText(
      "walletAge",
      `${Number(result.walletAgeDays) || 0} days`
    );

    setText(
      "activeDays",
      Number(result.activeDays) || 0
    );

    setText(
      "txCount",
      Number(result.txCount) || 0
    );

    setText(
      "contractsUsed",
      Number(result.contractsUsed) || 0
    );

    setText(
      "gasSpent",
      `${Number(
        result.gasSpent || 0
      ).toFixed(6)} ETH`
    );

    setText(
      "totalVolume",
      `${Number(
        result.totalVolume || 0
      ).toFixed(4)} ETH`
    );


    if (hasMintedPassport) {
      setText(
        "trustScore",
        dashboardScore
      );

      setText(
        "passportLevel",
        `Level ${dashboardLevel.level}`
      );

      setText(
        "identityScore",
        `${Number(
          result.identityScore
        ) || 0}/250`
      );

      setText(
        "activityScore",
        `${Number(
          result.activityScore
        ) || 0}/350`
      );

      setText(
        "economicScore",
        `${Number(
          result.economicScore
        ) || 0}/300`
      );

      setText(
        "diversityScore",
        `${Number(
          result.diversityScore
        ) || 0}/100`
      );

      setText(
        "passportOverlayLevelValue",
        `L${dashboardLevel.level}`
      );

      setText(
        "passportOverlayLevelName",
        dashboardLevel.name
      );

      setText(
        "passportOverlayScore",
        dashboardScore
      );

      const progressFill =
        document.getElementById(
          "passportProgressFill"
        );

      if (progressFill) {
        progressFill.style.width =
          `${dashboardScore / 10}%`;
      }

      updatePassportLevelTheme(
        dashboardLevel.level
      );

      const onchainScore = Number(
        passportState.trustScore
      );

      if (
        Number.isFinite(onchainScore) &&
        onchainScore !== dashboardScore
      ) {
        console.info(
          "Trust score verification pending:",
          {
            walletAddress,
            dashboardScore,
            onchainScore,
          }
        );

        const recommendationBox =
          document.getElementById(
            "aiRecommendations"
          );

        if (recommendationBox) {
          recommendationBox.insertAdjacentHTML(
            "beforeend",
            `<p>⏳ On-chain score verification is pending. NFT eligibility currently uses the verified score ${onchainScore}.</p>`
          );
        }
      }
    } else {

      setText(
        "trustScore",
        "---"
      );

      setText(
        "passportLevel",
        "Not Minted"
      );

      setText(
        "identityScore",
        "---/250"
      );

      setText(
        "activityScore",
        "---/350"
      );

      setText(
        "economicScore",
        "---/300"
      );

      setText(
        "diversityScore",
        "---/100"
      );

      setText(
        "passportOverlayLevelValue",
        "---"
      );

      setText(
        "passportOverlayLevelName",
        ""
      );

      setText(
        "passportOverlayScore",
        "---"
      );

      const progressFill =
        document.getElementById(
          "passportProgressFill"
        );

      if (progressFill) {
        progressFill.style.width = "0%";
      }
    }


    updateWalletIntelligence(result);

    return {
      result,
      passportState,
    };
  } catch (error) {
    console.error(
      "Analyze wallet failed:",
      error
    );

    if (
      isCurrentWalletSession(
        sessionVersion,
        walletAddress
      ) &&
      !silent
    ) {
      alert(
        error?.shortMessage ||
        error?.message ||
        "Analyze wallet failed"
      );
    }

    return null;
  } finally {
    if (
      analyzeBtn &&
      isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      analyzeBtn.disabled = false;
      analyzeBtn.innerText =
        "Analyze Wallet";
    }
  }
}

function renderWalletHeatmapFromTransactions(transactions = []) {
  const box = document.getElementById("walletHeatmap");
  if (!box) return;

  box.innerHTML = "";

  const dayMap = {};

  transactions.forEach((tx) => {
    const time =
      tx.timestamp ||
      tx.timeStamp ||
      tx.created_at ||
      tx.block_timestamp;

    if (!time) return;

    const date = new Date(time);
    if (isNaN(date.getTime())) return;

    const key = date.toISOString().slice(0, 10);

    if (!dayMap[key]) {
      dayMap[key] = { count: 0, gas: 0, volume: 0 };
    }

    dayMap[key].count += 1;

    const fee = Number(tx.fee?.value || tx.fee || tx.gas_fee || 0);
    if (!Number.isNaN(fee)) dayMap[key].gas += fee / 1e18;

    const value = Number(tx.value || 0);
    if (!Number.isNaN(value)) dayMap[key].volume += value / 1e18;
  });

  const today = new Date();

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthName = monthDate.toLocaleString("en", { month: "short" });
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const row = document.createElement("div");
    row.className = "calendar-row";

    const label = document.createElement("div");
    label.className = "calendar-month";
    label.textContent = monthName;
    row.appendChild(label);

    for (let day = 1; day <= 31; day++) {
      const cell = document.createElement("span");

      if (day > daysInMonth) {
        cell.className = "heat-cell empty";
        row.appendChild(cell);
        continue;
      }

      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const activity = dayMap[key] || { count: 0, gas: 0, volume: 0 };

      let level = 0;
      if (activity.count >= 10) level = 4;
      else if (activity.count >= 6) level = 3;
      else if (activity.count >= 3) level = 2;
      else if (activity.count >= 1) level = 1;

      cell.className = `heat-cell level-${level}`;

      cell.title = `${monthName} ${day}, ${year}
      Transactions: ${activity.count}
      Volume: ${activity.volume.toFixed(4)} ETH
      Gas: ${activity.gas.toFixed(6)} ETH`;

      row.appendChild(cell);
    }

    box.appendChild(row);
  }
}

function updateWalletIntelligence(data) {
  const score = Number(data.trustScore || 0);

  const consistency =
    data.walletAgeDays > 0
      ? Math.round((data.activeDays / data.walletAgeDays) * 100)
      : 0;

  let trustClass = "Emerging Identity";
  let riskSignal = "Medium";
  let report =
    "This wallet is still building its on-chain identity. More consistent activity will improve its reputation profile.";

  if (score >= 900) {
    trustClass = "Elite Trusted Wallet";
    riskSignal = "Very Low";
    report =
      "This wallet demonstrates exceptional long-term participation, strong activity, and deep ecosystem engagement across the Base network.";
  } else if (score >= 700) {
    trustClass = "Highly Trusted Wallet";
    riskSignal = "Low";
    report =
      "This wallet shows strong on-chain behavior with consistent activity, meaningful transaction history, and solid smart contract diversity.";
  } else if (score >= 500) {
    trustClass = "Trusted Contributor";
    riskSignal = "Moderate";
    report =
      "This wallet is building a reliable reputation with growing activity and ecosystem participation.";
  } else if (score >= 200) {
    trustClass = "Verified Explorer";
    riskSignal = "Medium";
    report =
      "This wallet has started forming an on-chain identity and shows early signs of real Base ecosystem activity.";
  }

  setText("aiWalletReport", report);
  setText("aiTrustClass", trustClass);
  setText("aiRiskSignal", riskSignal);

  const confidence = Math.min(
    99,
    Math.round(
      score * 0.05 +
        Math.min(Number(data.txCount || 0), 500) * 0.05 +
        Math.min(Number(data.contractsUsed || 0), 50) * 0.6 +
        consistency * 0.2
    )
  );

  setText("aiConfidence", `AI Confidence ${confidence}%`);

  const dnaIdentity = document.getElementById("dnaIdentity");
  const dnaActivity = document.getElementById("dnaActivity");
  const dnaEconomic = document.getElementById("dnaEconomic");
  const dnaDiversity = document.getElementById("dnaDiversity");

  if (dnaIdentity) {
    dnaIdentity.style.width = `${Math.min(
      (Number(data.identityScore || 0) / 250) * 100,
      100
    )}%`;
  }

  if (dnaActivity) {
    dnaActivity.style.width = `${Math.min(
      (Number(data.activityScore || 0) / 350) * 100,
      100
    )}%`;
  }

  if (dnaEconomic) {
    dnaEconomic.style.width = `${Math.min(
      (Number(data.economicScore || 0) / 300) * 100,
      100
    )}%`;
  }

  if (dnaDiversity) {
    dnaDiversity.style.width = `${Math.min(
      Number(data.diversityScore || 0),
      100
    )}%`;
  }

  const recs = [];

  const nextCredential =
    score < 100
      ? { name: "Explorer", required: 100 }
      : score < 300
        ? { name: "Contributor", required: 300 }
        : score < 600
          ? { name: "Builder", required: 600 }
          : score < 900
            ? { name: "Legend", required: 900 }
            : null;

  if (nextCredential) {
    recs.push(
      `Current Trust Score: ${score}. Earn ${
        nextCredential.required - score
      } more points to unlock the ${nextCredential.name} Credential.`
    );
  } else {
    recs.push(
      "You have reached the highest credential tier. Keep maintaining strong ecosystem participation."
    );
  }

  if (Number(data.walletAgeDays || 0) < 7) {
    recs.push(
      "Your wallet is still new. Keep using the same wallet over time to build a stronger identity history."
    );
  }

  if (
    Number(data.activeDays || 0) < 5 &&
    Number(data.txCount || 0) > 10
  ) {
    recs.push(
      "Your transactions are concentrated in a short period. Spread activity across more days to create a healthier reputation pattern."
    );
  } else if (Number(data.activeDays || 0) < 10) {
    recs.push(
      "Increase the number of active days to strengthen your Activity Score."
    );
  }

  if (Number(data.contractsUsed || 0) < 3) {
    recs.push(
      "Interact with more Base ecosystem contracts to improve your Diversity Score."
    );
  } else if (Number(data.contractsUsed || 0) >= 10) {
    recs.push(
      "Your contract diversity looks strong, showing broader ecosystem participation."
    );
  }

  if (Number(data.totalVolume || 0) < 0.01) {
    recs.push(
      "Your ETH transfer volume is still low. More meaningful Base activity can improve your Economic Score."
    );
  } else if (Number(data.economicScore || 0) >= 220) {
    recs.push(
      "Your economic footprint looks healthy through volume, transfers, and gas usage."
    );
  }

  if (Number(data.txCount || 0) < 10) {
    recs.push(
      "Build more transaction history to make your Base Trust Passport more reliable."
    );
  } else if (Number(data.txCount || 0) >= 100) {
    recs.push(
      "Your transaction history is strong and supports a more reliable identity profile."
    );
  }

  const recommendationBox = document.getElementById("aiRecommendations");

  if (recommendationBox) {
    recommendationBox.innerHTML = recs
      .slice(0, 5)
      .map((recommendation) => `<p>✓ ${recommendation}</p>`)
      .join("");
  }

  renderWalletHeatmapFromTransactions(data.transactions || []);

  const placeholder = document.getElementById("heatmapPlaceholder");
  const content = document.getElementById("heatmapContent");

  if (placeholder) {
    placeholder.style.display = "none";
  }

  if (content) {
    content.style.display = "block";
  }
}

async function fetchAllTransactions(wallet) {
  return fetchBlockscoutTransactions(
    BLOCKSCOUT_API,
    wallet,
    MAX_BASE_TRANSACTIONS
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function logScore(value, maxInput, maxScore) {
  if (!value || value <= 0) return 0;

  const normalized =
    Math.log10(value + 1) / Math.log10(maxInput + 1);

  return Math.pow(normalized, 1.7) * maxScore;
}

const ETHEREUM_BLOCKSCOUT_API = (
  import.meta.env.VITE_ETHEREUM_BLOCKSCOUT_API_URL ||
  "https://eth.blockscout.com/api/v2"
).trim().replace(/\/+$/, "");

async function fetchBlockscoutTransactions(
  apiBase,
  wallet,
  maxTransactions
) {
  if (!ethers.isAddress(wallet)) {
    throw new Error(
      "Invalid wallet address"
    );
  }

  const transactions = [];
  let nextPageParams = null;
  let pageCount = 0;

  const maxPages = Math.max(
    1,
    Math.ceil(maxTransactions / 50)
  );

  do {
    const url = new URL(
      `${apiBase}/addresses/${wallet}/transactions`
    );

    if (nextPageParams) {
      Object.entries(nextPageParams).forEach(
        ([key, value]) => {
          if (
            value !== null &&
            value !== undefined
          ) {
            url.searchParams.set(
              key,
              String(value)
            );
          }
        }
      );
    }

    const data = await fetchJsonWithTimeout(
      url.toString()
    );

    const items = Array.isArray(data?.items)
      ? data.items
      : [];

    transactions.push(...items);

    nextPageParams =
      data?.next_page_params || null;

    pageCount += 1;
  } while (
    nextPageParams &&
    transactions.length < maxTransactions &&
    pageCount < maxPages
  );

  return deduplicateTransactions(
    transactions
  ).slice(0, maxTransactions);
}

async function fetchEthereumTransactions(wallet) {
  return fetchBlockscoutTransactions(
    ETHEREUM_BLOCKSCOUT_API,
    wallet,
    MAX_ETHEREUM_TRANSACTIONS
  );
}

async function calculateTrustScore(wallet) {
  const normalizedWallet =
    ethers.getAddress(wallet);

  const [
    baseResult,
    ethereumResult,
  ] = await Promise.allSettled([
    fetchAllTransactions(normalizedWallet),
    fetchEthereumTransactions(normalizedWallet),
  ]);

  if (
    baseResult.status !== "fulfilled" ||
    !Array.isArray(baseResult.value)
  ) {
    const baseError =
      baseResult.status === "rejected"
        ? baseResult.reason
        : null;

    throw new Error(
      baseError?.message ||
      "Unable to load Base transaction history"
    );
  }

  const rawBaseTransactions =
    baseResult.value;

  const rawEthereumTransactions =
    ethereumResult.status === "fulfilled" &&
    Array.isArray(ethereumResult.value)
      ? ethereumResult.value
      : [];

  if (ethereumResult.status === "rejected") {
    console.warn(
      "Ethereum transaction history unavailable; continuing with Base data only:",
      ethereumResult.reason
    );
  }


  const baseTransactions =
    rawBaseTransactions.filter(
      (tx) =>
        isSuccessfulBlockscoutTransaction(tx) &&
        isOutgoingTransaction(
          tx,
          normalizedWallet
        ) &&
        !isSelfDirectedTransaction(
          tx,
          normalizedWallet
        )
    );

  const ethereumTransactions =
    rawEthereumTransactions.filter(
      (tx) =>
        isSuccessfulBlockscoutTransaction(tx) &&
        isOutgoingTransaction(
          tx,
          normalizedWallet
        ) &&
        !isSelfDirectedTransaction(
          tx,
          normalizedWallet
        )
    );


  const baseScoringTransactions =
    capTransactionsPerDay(
      baseTransactions,
      MAX_SCORING_TX_PER_DAY
    );

  const ethereumScoringTransactions =
    capTransactionsPerDay(
      ethereumTransactions,
      MAX_SCORING_TX_PER_DAY
    );

  const timestamps = baseTransactions
    .map(getTransactionTimestamp)
    .filter(Boolean);

  const now = new Date();

  const firstTxDate = timestamps.length
    ? new Date(
        Math.min(
          ...timestamps.map(
            (date) => date.getTime()
          )
        )
      )
    : null;

  const walletAgeDays = firstTxDate
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - firstTxDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const activeDateSet = new Set(
    timestamps.map(
      (date) =>
        date.toISOString().split("T")[0]
    )
  );

  const activeDays = activeDateSet.size;

  const baseTxCount =
    baseTransactions.length;

  const ethereumTxCount =
    ethereumTransactions.length;

  const weightedTxCount =
    baseScoringTransactions.length +
    ethereumScoringTransactions.length * 0.35;

  const contractSet = new Set();

  let gasSpent = 0;
  let totalVolume = 0;

  for (const tx of baseTransactions) {
    const targetAddress =
      getBlockscoutAddressHash(tx?.to);

    if (
      tx?.to?.is_contract === true &&
      typeof targetAddress === "string" &&
      ethers.isAddress(targetAddress)
    ) {
      contractSet.add(
        targetAddress.toLowerCase()
      );
    }

    gasSpent += weiToEtherNumber(
      tx?.fee?.value ?? tx?.fee ?? 0
    );

    totalVolume += weiToEtherNumber(
      tx?.value ?? 0
    );
  }

  const contractsUsed = contractSet.size;

  const walletAgeScore = logScore(
    walletAgeDays,
    540,
    150
  );

  const consistencyScore = logScore(
    activeDays,
    90,
    100
  );

  const identityScore = clamp(
    Math.round(
      walletAgeScore + consistencyScore
    ),
    0,
    250
  );

  const activeDaysScore = logScore(
    activeDays,
    120,
    140
  );

  const transactionScore = logScore(
    weightedTxCount,
    300,
    210
  );

  const activityScore = clamp(
    Math.round(
      activeDaysScore + transactionScore
    ),
    0,
    350
  );

  const normalizedVolume =
    Math.max(0, totalVolume) * 20;

  const normalizedGas =
    Math.max(0, gasSpent) * 20000;

  const volumeScore = logScore(
    normalizedVolume,
    50,
    180
  );

  const gasScore = logScore(
    normalizedGas,
    500,
    120
  );

  const economicScore = clamp(
    Math.round(volumeScore + gasScore),
    0,
    300
  );

  const diversityScore = clamp(
    Math.round(
      logScore(
        contractsUsed,
        120,
        100
      )
    ),
    0,
    100
  );

  const trustScore = clamp(
    Math.round(
      identityScore +
      activityScore +
      economicScore +
      diversityScore
    ),
    0,
    1000
  );

  const level = getPassportLevel(trustScore);

  return {
    trustScore,

    level: level.level,
    levelName: level.name,

    walletAgeDays,
    activeDays,

    txCount: baseTxCount,
    baseTxCount,
    ethereumTxCount,

    scoringBaseTxCount:
      baseScoringTransactions.length,

    scoringEthereumTxCount:
      ethereumScoringTransactions.length,

    weightedTxCount: Number(
      weightedTxCount.toFixed(2)
    ),

    contractsUsed,

    gasSpent: Number(
      gasSpent.toFixed(8)
    ),

    totalVolume: Number(
      totalVolume.toFixed(6)
    ),

    walletAgeScore:
      Math.round(walletAgeScore),

    consistencyScore:
      Math.round(consistencyScore),

    activeDaysScore:
      Math.round(activeDaysScore),

    transactionScore:
      Math.round(transactionScore),

    volumeScore:
      Math.round(volumeScore),

    gasScore:
      Math.round(gasScore),

    identityScore,
    activityScore,
    economicScore,
    diversityScore,

    transactions: baseTransactions,
  };
}

function getPassportLevel(score) {
  let current = levels[0];

  for (const item of levels) {
    if (score >= item.min) {
      current = item;
    }
  }

  return {
    level: current.level,
    name: current.name,
    levelName: current.name,
    min: current.min,
  };
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function refreshWalletOnchainState(options = {}) {
  const sessionVersion =
    options.sessionVersion ?? walletSessionVersion;

  const walletAddress =
    options.walletAddress ?? userAddress;

  const providerSnapshot =
    options.provider ?? provider;

  const passportContractSnapshot =
    options.passportContract ?? passportContract;

  const credentialContractSnapshot =
    options.credentialContract ?? credentialContract;

  const levelNFTContractSnapshot =
    options.levelNFTContract ?? levelNFTContract;

  if (
    !walletAddress ||
    !providerSnapshot ||
    !passportContractSnapshot ||
    !credentialContractSnapshot ||
    !levelNFTContractSnapshot
  ) {
    return null;
  }

  const viewVersion = beginWalletView();

  try {
    const blockTag =
      options.blockTag ??
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return null;
    }

    const passportState =
      await refreshPassportStatus({
        sessionVersion,
        viewVersion,
        walletAddress,
        passportContract:
          passportContractSnapshot,
        blockTag,
      });

    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return null;
    }

    if (!passportState || passportState.readFailed) {
      return passportState;
    }

    const onchainScore =
      passportState.hasPassport
        ? Number(passportState.trustScore)
        : null;

    await Promise.all([
      renderCredentials(onchainScore, {
        sessionVersion,
        viewVersion,
        walletAddress,
        provider: providerSnapshot,
        credentialContract:
          credentialContractSnapshot,
        blockTag,
        hasPassport:
          passportState.hasPassport,
      }),

      renderLevelCards(onchainScore, {
        sessionVersion,
        viewVersion,
        walletAddress,
        provider: providerSnapshot,
        levelNFTContract:
          levelNFTContractSnapshot,
        blockTag,
        hasPassport:
          passportState.hasPassport,
        passportLevel:
          passportState.level,
      }),
    ]);

    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return null;
    }

    return passportState;
  } catch (error) {
    console.error(
      "Wallet on-chain refresh failed:",
      error
    );

    if (
      isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      const mintBtn =
        document.getElementById("mintBtn");

      if (mintBtn) {
        mintBtn.innerText =
          "Passport Read Failed";
        mintBtn.disabled = false;
      }
    }

    return {
      readFailed: true,
      error,
    };
  }
}

async function mintPassport() {
  const mintBtn =
    document.getElementById("mintBtn");

  if (!mintBtn) return;

  if (
    !provider ||
    !signer ||
    !userAddress ||
    !passportContract ||
    !credentialContract ||
    !levelNFTContract
  ) {
    mintBtn.innerText =
      "Connect Wallet First";

    mintBtn.disabled = false;
    return;
  }

  const sessionVersion =
    walletSessionVersion;

  const walletAddress =
    userAddress;

  const providerSnapshot =
    provider;

  const passportContractSnapshot =
    passportContract;

  const credentialContractSnapshot =
    credentialContract;

  const levelNFTContractSnapshot =
    levelNFTContract;

  const refreshAfterMint =
    async (blockTag) => {
      const passportState =
        await refreshWalletOnchainState({
          sessionVersion,
          walletAddress,
          provider:
            providerSnapshot,
          passportContract:
            passportContractSnapshot,
          credentialContract:
            credentialContractSnapshot,
          levelNFTContract:
            levelNFTContractSnapshot,
          blockTag,
        });

      if (
        passportState?.hasPassport === true &&
        isCurrentWalletSession(
          sessionVersion,
          walletAddress
        )
      ) {
        await analyzeWallet({
          sessionVersion,
          walletAddress,
          provider:
            providerSnapshot,
          passportContract:
            passportContractSnapshot,
          passportState,
          silent: true,
        });
      }

      return passportState;
    };

  try {
    mintBtn.disabled = true;
    mintBtn.innerText =
      "Checking Passport...";

    const alreadyMinted =
      await passportContractSnapshot.hasPassport(
        walletAddress
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (alreadyMinted) {
      const blockTag =
        await providerSnapshot.getBlockNumber();

      if (
        !isCurrentWalletSession(
          sessionVersion,
          walletAddress
        )
      ) {
        return;
      }

      await refreshAfterMint(blockTag);
      return;
    }

    mintBtn.innerText =
      "Confirm in Wallet...";

    const mintFee =
      await passportContractSnapshot.mintFee();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const tx =
      await passportContractSnapshot.mintPassport({
        value: mintFee,
      });

    mintBtn.innerText =
      "Confirming on Base...";

    await tx.wait(2);

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    mintBtn.innerText =
      "Syncing Passport...";


    const blockTag =
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const passportState =
      await refreshAfterMint(blockTag);

    if (
      passportState?.readFailed &&
      isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      alert(
        "Passport mint was confirmed, but the UI could not read the synchronized block. Reload the page to refresh it."
      );
    }
  } catch (error) {
    console.error(
      "Mint passport failed:",
      error
    );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }


    try {
      const blockTag =
        await providerSnapshot.getBlockNumber();

      const actuallyMinted =
        await passportContractSnapshot.hasPassport(
          walletAddress,
          { blockTag }
        );

      if (actuallyMinted) {
        await refreshAfterMint(blockTag);
        return;
      }
    } catch (readError) {
      console.error(
        "Post-error Passport read failed:",
        readError
      );

      mintBtn.innerText =
        "Passport Read Failed";

      mintBtn.disabled = false;

      alert(
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        "Mint passport failed"
      );

      return;
    }

    mintBtn.innerText =
      "Mint Passport";

    mintBtn.disabled = false;

    mintBtn.classList.remove(
      "minted"
    );

    alert(
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      "Mint passport failed"
    );
  }
}

window.mintPassport = mintPassport;

async function refreshPassportStatus(input = {}) {
  const options =
    input && typeof input === "object"
      ? input
      : {
          walletAddress: input,
        };

  const sessionVersion =
    options.sessionVersion ??
    walletSessionVersion;

  const viewVersion =
    options.viewVersion ??
    walletViewVersion;

  const walletAddress =
    options.walletAddress ??
    userAddress;

  const passportContractSnapshot =
    options.passportContract ??
    passportContract;

  const blockTag =
    options.blockTag;

  const mintBtn =
    document.getElementById("mintBtn");

  if (
    !mintBtn ||
    !walletAddress ||
    !ethers.isAddress(walletAddress) ||
    !passportContractSnapshot
  ) {
    return null;
  }

  const callOptions =
    blockTag === null ||
    blockTag === undefined
      ? {}
      : {
          blockTag,
        };

  try {
    const hasPassport =
      await passportContractSnapshot.hasPassport(
        walletAddress,
        callOptions
      );

    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return null;
    }

    if (!hasPassport) {
      mintBtn.innerText =
        "Mint Passport";

      mintBtn.disabled = false;

      mintBtn.classList.remove(
        "minted"
      );

      setText(
        "passportOverlayId",
        "Not Minted"
      );

      setText(
        "passportOverlayLevelValue",
        "---"
      );

      setText(
        "passportOverlayLevelName",
        ""
      );

      setText(
        "passportOverlayScore",
        "---"
      );

      const progressFill =
        document.getElementById(
          "passportProgressFill"
        );

      if (progressFill) {
        progressFill.style.width =
          "0%";
      }

      updatePassportLevelTheme(1);

      return {
        hasPassport: false,
        passportId: null,
        trustScore: null,
        level: null,
        blockTag,
      };
    }

    const [
      passportNumberRaw,
      trustScoreRaw,
      levelRaw,
    ] = await Promise.all([
      passportContractSnapshot
        .passportNumberOfWallet(
          walletAddress,
          callOptions
        ),

      passportContractSnapshot
        .trustScoreOf(
          walletAddress,
          callOptions
        ),

      passportContractSnapshot
        .levelOf(
          walletAddress,
          callOptions
        ),
    ]);

    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return null;
    }

    const passportId =
      formatPassportId(
        passportNumberRaw
      );

    const onchainScore =
      Math.max(
        0,
        Math.min(
          1000,
          Number(trustScoreRaw) || 0
        )
      );

    const onchainLevel =
      Math.max(
        1,
        Math.min(
          10,
          Number(levelRaw) || 1
        )
      );

    mintBtn.innerText =
      "✅ Passport Minted";

    mintBtn.disabled = true;

    mintBtn.classList.add(
      "minted"
    );


    setText(
      "passportOverlayId",
      passportId
    );

    return {
      hasPassport: true,
      passportId,
      trustScore: onchainScore,
      level: onchainLevel,
      blockTag,
    };
  } catch (error) {
    console.error(
      "Passport status read failed:",
      error
    );

    if (
      isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      mintBtn.innerText =
        "Passport Read Failed";

      mintBtn.disabled = false;
    }

    return {
      readFailed: true,
      error,
      blockTag,
    };
  }
}

function formatPassportId(passportNumber) {
    return `BASE-${passportNumber
        .toString()
        .padStart(6, "0")}`;
}
function getPassportTier(level) {
  const safeLevel = Math.max(1, Math.min(10, Number(level) || 1));

  if (safeLevel >= 10) return "gold";
  if (safeLevel >= 7) return "purple";
  if (safeLevel >= 4) return "orange";

  return "blue";
}

function updatePassportLevelTheme(level) {
  const passportWrapper = document.querySelector(".passport-image-wrapper");

  if (!passportWrapper) return;

  const safeLevel = Math.max(1, Math.min(10, Number(level) || 1));
  const tier = getPassportTier(safeLevel);

  passportWrapper.classList.remove(
    "passport-tier-blue",
    "passport-tier-orange",
    "passport-tier-purple",
    "passport-tier-gold",
    "passport-level-1",
    "passport-level-2",
    "passport-level-3",
    "passport-level-4",
    "passport-level-5",
    "passport-level-6",
    "passport-level-7",
    "passport-level-8",
    "passport-level-9",
    "passport-level-10"
  );

  passportWrapper.classList.add(
    `passport-tier-${tier}`,
    `passport-level-${safeLevel}`
  );

  passportWrapper.dataset.level = String(safeLevel);
}
const credentials = [
  { id: 1, name: "Explorer", required: 100, image: "/credential/explorer.png" },
  { id: 2, name: "Contributor", required: 300, image: "/credential/contributor.png" },
  { id: 3, name: "Builder", required: 600, image: "/credential/builder.png" },
  { id: 4, name: "Legend", required: 900, image: "/credential/legend.png" },
];

async function renderCredentials(
  score = null,
  options = {}
) {
  const box =
    document.getElementById("credentialList");

  if (!box) return;

  const sessionVersion =
    options.sessionVersion ?? walletSessionVersion;

  const viewVersion =
    options.viewVersion ?? walletViewVersion;

  const walletAddress =
    options.walletAddress ?? userAddress;

  const providerSnapshot =
    options.provider ?? provider;

  const credentialContractSnapshot =
    options.credentialContract ??
    credentialContract;

  const hasPassport = options.hasPassport;

  const normalizedScore = Math.max(
    0,
    Math.min(1000, Number(score) || 0)
  );

  const walletConnected = Boolean(
    walletAddress &&
    credentialContractSnapshot
  );

  const createCard = (
    item,
    {
      claimed = false,
      eligible = false,
      reason = "",
      readFailed = false,
      passportRequired = false,
    } = {}
  ) => {
    const credentialId = Number(item.id);

    const scoreUnlocked =
      normalizedScore >= Number(item.required);

    let buttonText = "Locked";
    let disabled = true;
    let cardStatus = "locked";

    if (!walletConnected) {
      buttonText = scoreUnlocked
        ? "Connect Wallet"
        : "Locked";

      cardStatus = scoreUnlocked
        ? "wallet-required"
        : "locked";
    } else if (readFailed) {
      buttonText = "Read Failed";
      cardStatus = "read-failed";
    } else if (passportRequired) {
      buttonText = "Mint Passport First";
      cardStatus = "locked";
    } else if (claimed) {
      buttonText = "Claimed";
      cardStatus = "claimed";
    } else if (!scoreUnlocked) {
      buttonText = "Locked";
      cardStatus = "locked";
    } else if (
      reason === "PREVIOUS_CREDENTIAL_REQUIRED"
    ) {
      buttonText = "Claim Previous First";
      cardStatus = "previous-required";
    } else if (eligible) {
      buttonText = "Claim";
      disabled = false;
      cardStatus = "eligible";
    }

    return `
      <div
        class="credential-card ${cardStatus}"
        data-credential-id="${credentialId}"
      >
        <div class="credential-left">
          <img
            class="credential-badge-img"
            src="${item.image}"
            alt="${item.name}"
            onerror="this.style.display='none'"
          />

          <div class="credential-info">
            <h3>${item.name}</h3>
            <p>
              Requires ${item.required} Trust Score
            </p>
          </div>
        </div>

        <button
          class="credential-btn"
          ${disabled ? "disabled" : ""}
          onclick="claimCredentialNFT(
            ${credentialId},
            '${item.name.replace(/'/g, "\\'")}'
          )"
        >
          ${buttonText}
        </button>
      </div>
    `;
  };

  if (!walletConnected) {
    box.innerHTML = credentials
      .map((item) => createCard(item))
      .join("");

    return;
  }

  if (hasPassport === false) {
    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return;
    }

    box.innerHTML = credentials
      .map((item) =>
        createCard(item, {
          passportRequired: true,
        })
      )
      .join("");

    return;
  }

  let blockTag = options.blockTag;

  if (
    blockTag === null ||
    blockTag === undefined
  ) {
    if (!providerSnapshot) return;

    blockTag =
      await providerSnapshot.getBlockNumber();
  }

  const callOptions = { blockTag };

  const cards = await Promise.all(
    credentials.map(async (item) => {
      const credentialId = Number(item.id);

      const scoreUnlocked =
        normalizedScore >= Number(item.required);

      try {
        const claimed =
          await credentialContractSnapshot.hasClaimed(
            walletAddress,
            credentialId,
            callOptions
          );

        let eligible = false;
        let reason = "";

        if (!claimed) {
          const result =
            await credentialContractSnapshot.canClaim(
              walletAddress,
              credentialId,
              callOptions
            );

          const contractEligible =
            Boolean(result[0]);

          reason =
            String(result[1] || "");

          eligible =
            scoreUnlocked &&
            contractEligible;
        }

        return createCard(item, {
          claimed,
          eligible,
          reason,
        });
      } catch (error) {
        console.error(
          `Credential ${credentialId} status error:`,
          error
        );

        return createCard(item, {
          readFailed: true,
        });
      }
    })
  );

  if (
    !isCurrentWalletView(
      sessionVersion,
      walletAddress,
      viewVersion
    )
  ) {
    return;
  }

  box.innerHTML = cards.join("");
}

async function claimCredentialNFT(
  credentialId,
  credentialName
) {
  if (
    !provider ||
    !userAddress ||
    !passportContract ||
    !credentialContract ||
    !levelNFTContract
  ) {
    alert("Connect wallet first");
    return;
  }

  const normalizedCredentialId =
    Number(credentialId);

  const credentialItem =
    credentials.find(
      (item) =>
        Number(item.id) === normalizedCredentialId
    );

  if (!credentialItem) {
    alert("Invalid Credential NFT");
    return;
  }

  const normalizedScore = Math.max(
    0,
    Math.min(
      1000,
      Number(currentTrustScore) || 0
    )
  );

  const requiredScore =
    Number(credentialItem.required);

  if (normalizedScore < requiredScore) {
    alert(
      `${credentialName} requires ${requiredScore} Trust Score. Your current score is ${normalizedScore}.`
    );

    return;
  }

  const sessionVersion =
    walletSessionVersion;

  const walletAddress =
    userAddress;

  const providerSnapshot =
    provider;

  const passportContractSnapshot =
    passportContract;

  const credentialContractSnapshot =
    credentialContract;

  const levelNFTContractSnapshot =
    levelNFTContract;

  const button = document.querySelector(
    `[data-credential-id="${normalizedCredentialId}"] .credential-btn`
  );

  const originalText =
    button?.innerText ||
    `Claim ${credentialName}`;

  try {
    if (button) {
      button.disabled = true;
      button.innerText = "Checking...";
    }

    const blockTag =
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const callOptions = { blockTag };

    const alreadyClaimed =
      await credentialContractSnapshot.hasClaimed(
        walletAddress,
        normalizedCredentialId,
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (alreadyClaimed) {
      if (button) {
        button.disabled = true;
        button.innerText = "Claimed";
      }

      alert(
        `${credentialName} has already been claimed by this wallet.`
      );

      return;
    }

    const claimStatus =
      await credentialContractSnapshot.canClaim(
        walletAddress,
        normalizedCredentialId,
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const contractEligible =
      Boolean(claimStatus[0]);

    const reason =
      String(claimStatus[1] || "");

    if (!contractEligible) {
      let message =
        "Credential NFT is not eligible for claim.";

      if (reason === "PASSPORT_REQUIRED") {
        message =
          "Mint your Passport before claiming a Credential NFT.";
      } else if (reason === "ALREADY_CLAIMED") {
        message =
          `${credentialName} has already been claimed.`;
      } else if (
        reason === "PREVIOUS_CREDENTIAL_REQUIRED"
      ) {
        message =
          `Claim Credential ${normalizedCredentialId - 1} first.`;
      } else if (
        reason === "INVALID_CREDENTIAL_ID"
      ) {
        message =
          "Invalid Credential NFT.";
      }

      if (button) {
        button.disabled = false;
        button.innerText = originalText;
      }

      alert(message);
      return;
    }

    const claimFee =
      await credentialContractSnapshot.claimFee(
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.innerText = "Claiming...";
    }

    const tx =
      await credentialContractSnapshot
        .claimCredential(
          normalizedCredentialId,
          {
            value: claimFee,
          }
        );

    if (button) {
      button.innerText = "Confirming...";
    }

    await tx.wait(2);

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.innerText = "Syncing...";
    }

    const confirmedBlockTag =
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const state =
      await refreshWalletOnchainState({
        sessionVersion,
        walletAddress,
        provider: providerSnapshot,
        passportContract:
          passportContractSnapshot,
        credentialContract:
          credentialContractSnapshot,
        levelNFTContract:
          levelNFTContractSnapshot,
        blockTag: confirmedBlockTag,
      });

    if (
      state?.readFailed &&
      isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      if (button) {
        button.disabled = false;
        button.innerText = "Refresh Page";
      }

      alert(
        "Credential claim was confirmed, but the UI could not read the synchronized block. Reload the page to refresh it."
      );
    }
  } catch (error) {
    console.error(
      `Claim ${credentialName} failed:`,
      error
    );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.disabled = false;
      button.innerText = originalText;
    }

    alert(
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      "Credential claim failed"
    );
  }
}

async function renderLevelCards(
  score = null,
  options = {}
) {
  const box =
    document.getElementById("levelCards");

  if (!box) return;

  const sessionVersion =
    options.sessionVersion ?? walletSessionVersion;

  const viewVersion =
    options.viewVersion ?? walletViewVersion;

  const walletAddress =
    options.walletAddress ?? userAddress;

  const providerSnapshot =
    options.provider ?? provider;

  const levelNFTContractSnapshot =
    options.levelNFTContract ?? levelNFTContract;

  const hasPassport = options.hasPassport;

  const normalizedScore = Math.max(
    0,
    Math.min(1000, Number(score) || 0)
  );

  const passportLevel = Math.max(
    1,
    Math.min(
      10,
      Number(options.passportLevel) ||
        getPassportLevel(normalizedScore).level
    )
  );

  const walletConnected = Boolean(
    walletAddress &&
    levelNFTContractSnapshot
  );

  const createCard = (
    item,
    {
      claimed = false,
      eligible = false,
      reason = "",
      readFailed = false,
      passportRequired = false,
    } = {}
  ) => {
    const levelId = Number(item.level);
    const requiredScore = Number(item.min);

    const scoreUnlocked =
      normalizedScore >= requiredScore;

    const isCurrentLevel =
      hasPassport !== false &&
      levelId === passportLevel;

    let buttonText = "Locked";
    let disabled = true;
    let cardStatus = "locked";

    if (!walletConnected) {
      buttonText = scoreUnlocked
        ? "Connect Wallet"
        : "Locked";

      cardStatus = scoreUnlocked
        ? "wallet-required"
        : "locked";
    } else if (readFailed) {
      buttonText = "Read Failed";
      cardStatus = "read-failed";
    } else if (passportRequired) {
      buttonText = "Mint Passport First";
      cardStatus = "locked";
    } else if (claimed) {
      buttonText = "Claimed";
      cardStatus = "claimed";
    } else if (!scoreUnlocked) {
      buttonText = "Locked";
      cardStatus = "locked";
    } else if (
      reason === "PREVIOUS_LEVEL_REQUIRED"
    ) {
      buttonText = "Claim Previous First";
      cardStatus = "previous-required";
    } else if (eligible) {
      buttonText = "Claim";
      disabled = false;
      cardStatus = "eligible";
    }

    return `
      <div
        class="
          level-card
          level-${levelId}
          ${cardStatus}
          ${scoreUnlocked ? "score-unlocked" : "score-locked"}
          ${isCurrentLevel ? "current-level" : ""}
        "
        data-level-id="${levelId}"
      >
        <div class="mini-nft">
          <div class="nft-energy">
            <span class="nft-core-glow"></span>

            <span class="nft-rays nft-rays-one">
              <i></i><i></i><i></i><i></i>
              <i></i><i></i><i></i><i></i>
            </span>

            <span class="nft-rays nft-rays-two">
              <i></i><i></i><i></i>
              <i></i><i></i><i></i>
            </span>

            <span class="nft-orbit nft-orbit-one"></span>
            <span class="nft-orbit nft-orbit-two"></span>

            <img
              src="/levels/level${levelId}.png"
              alt="Level ${levelId}"
              onerror="this.style.display='none'"
            />
          </div>
        </div>

        <h4>${item.name}</h4>

        <p>
          ${requiredScore} Trust Score
        </p>

        <button
          ${disabled ? "disabled" : ""}
          onclick="claimLevelNFT(${levelId})"
        >
          ${buttonText}
        </button>
      </div>
    `;
  };

  if (!walletConnected) {
    updateLevelHeader(null, null, false);

    box.innerHTML = levels
      .map((item) => createCard(item))
      .join("");

    return;
  }

  if (hasPassport === false) {
    if (
      !isCurrentWalletView(
        sessionVersion,
        walletAddress,
        viewVersion
      )
    ) {
      return;
    }

    updateLevelHeader(null, null, false);

    box.innerHTML = levels
      .map((item) =>
        createCard(item, {
          passportRequired: true,
        })
      )
      .join("");

    return;
  }

  let blockTag = options.blockTag;

  if (
    blockTag === null ||
    blockTag === undefined
  ) {
    if (!providerSnapshot) return;

    blockTag =
      await providerSnapshot.getBlockNumber();
  }

  const callOptions = { blockTag };

  const cards = await Promise.all(
    levels.map(async (item) => {
      const levelId = Number(item.level);
      const requiredScore = Number(item.min);

      const scoreUnlocked =
        normalizedScore >= requiredScore;

      try {
        const claimed =
          await levelNFTContractSnapshot.hasClaimed(
            walletAddress,
            levelId,
            callOptions
          );

        let eligible = false;
        let reason = "";

        if (!claimed) {
          const result =
            await levelNFTContractSnapshot.canClaim(
              walletAddress,
              levelId,
              callOptions
            );

          const contractEligible =
            Boolean(result[0]);

          reason =
            String(result[1] || "");

          eligible =
            scoreUnlocked &&
            contractEligible;
        }

        return createCard(item, {
          claimed,
          eligible,
          reason,
        });
      } catch (error) {
        console.error(
          `Level ${levelId} status error:`,
          error
        );

        return createCard(item, {
          readFailed: true,
        });
      }
    })
  );

  if (
    !isCurrentWalletView(
      sessionVersion,
      walletAddress,
      viewVersion
    )
  ) {
    return;
  }

  updateLevelHeader(
    normalizedScore,
    passportLevel,
    true
  );

  box.innerHTML = cards.join("");
}

async function claimLevelNFT(levelId) {
  if (
    !provider ||
    !userAddress ||
    !passportContract ||
    !credentialContract ||
    !levelNFTContract
  ) {
    alert("Connect wallet first");
    return;
  }

  const normalizedLevelId =
    Number(levelId);

  const levelItem =
    levels.find(
      (item) =>
        Number(item.level) === normalizedLevelId
    );

  if (!levelItem) {
    alert("Invalid Level NFT");
    return;
  }

  const normalizedScore = Math.max(
    0,
    Math.min(
      1000,
      Number(currentTrustScore) || 0
    )
  );

  const requiredScore =
    Number(levelItem.min);


  if (normalizedScore < requiredScore) {
    alert(
      `Level ${normalizedLevelId} requires ${requiredScore} Trust Score. Your current score is ${normalizedScore}.`
    );

    return;
  }

  const sessionVersion =
    walletSessionVersion;

  const walletAddress =
    userAddress;

  const providerSnapshot =
    provider;

  const passportContractSnapshot =
    passportContract;

  const credentialContractSnapshot =
    credentialContract;

  const levelNFTContractSnapshot =
    levelNFTContract;

  const button =
    document.querySelector(
      `[data-level-id="${normalizedLevelId}"] button`
    );

  const originalText =
    button?.innerText ||
    `Claim Level ${normalizedLevelId}`;

  try {
    if (button) {
      button.disabled = true;
      button.innerText = "Checking...";
    }

    const blockTag =
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const callOptions = { blockTag };


    const alreadyClaimed =
      await levelNFTContractSnapshot.hasClaimed(
        walletAddress,
        normalizedLevelId,
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (alreadyClaimed) {
      if (button) {
        button.disabled = true;
        button.innerText = "Claimed";
      }

      alert(
        `Level ${normalizedLevelId} has already been claimed by this wallet.`
      );

      return;
    }


    const claimStatus =
      await levelNFTContractSnapshot.canClaim(
        walletAddress,
        normalizedLevelId,
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const contractEligible =
      Boolean(claimStatus[0]);

    const reason =
      String(claimStatus[1] || "");

    if (!contractEligible) {
      let message =
        "Level NFT is not eligible for claim.";

      if (reason === "PASSPORT_REQUIRED") {
        message =
          "Mint your Passport before claiming a Level NFT.";
      } else if (reason === "ALREADY_CLAIMED") {
        message =
          `Level ${normalizedLevelId} has already been claimed.`;
      } else if (
        reason === "PREVIOUS_LEVEL_REQUIRED"
      ) {
        message =
          `Claim Level ${normalizedLevelId - 1} first.`;
      } else if (
        reason === "INVALID_LEVEL_ID"
      ) {
        message =
          "Invalid Level NFT.";
      }

      if (button) {
        button.disabled = false;
        button.innerText = originalText;
      }

      alert(message);
      return;
    }

    const claimFee =
      await levelNFTContractSnapshot.claimFee(
        callOptions
      );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.innerText = "Claiming...";
    }

    const tx =
      await levelNFTContractSnapshot.claimLevel(
        normalizedLevelId,
        {
          value: claimFee,
        }
      );

    if (button) {
      button.innerText = "Confirming...";
    }

    await tx.wait(2);

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.innerText = "Syncing...";
    }

    const confirmedBlockTag =
      await providerSnapshot.getBlockNumber();

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    const state =
      await refreshWalletOnchainState({
        sessionVersion,
        walletAddress,
        provider: providerSnapshot,
        passportContract:
          passportContractSnapshot,
        credentialContract:
          credentialContractSnapshot,
        levelNFTContract:
          levelNFTContractSnapshot,
        blockTag: confirmedBlockTag,
      });

    if (
      state?.readFailed &&
      isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      if (button) {
        button.disabled = false;
        button.innerText = "Refresh Page";
      }

      alert(
        "Level claim was confirmed, but the UI could not read the synchronized block. Reload the page to refresh it."
      );
    }
  } catch (error) {
    console.error(
      `Claim Level ${normalizedLevelId} failed:`,
      error
    );

    if (
      !isCurrentWalletSession(
        sessionVersion,
        walletAddress
      )
    ) {
      return;
    }

    if (button) {
      button.disabled = false;
      button.innerText = originalText;
    }

    alert(
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      "Level NFT claim failed"
    );
  }
}

function updateLevelHeader(
  score = null,
  levelNumber = null,
  active = false
) {
  const levelValue =
    document.getElementById("myLevel");

  const nextPointsValue =
    document.getElementById("nextLevelPoints");

  if (
    !active ||
    score === null ||
    score === undefined
  ) {
    if (levelValue) {
      levelValue.innerText = "--";
    }

    if (nextPointsValue) {
      nextPointsValue.innerText = "--";
    }

    return;
  }

  const normalizedScore = Math.max(
    0,
    Math.min(1000, Number(score) || 0)
  );

  const currentLevelNumber = Math.max(
    1,
    Math.min(
      10,
      Number(levelNumber) ||
        getPassportLevel(normalizedScore).level
    )
  );

  const nextLevel = levels.find(
    (item) =>
      Number(item.level) ===
      currentLevelNumber + 1
  );

  const pointsToNextLevel = nextLevel
    ? Math.max(
        0,
        Number(nextLevel.min) - normalizedScore
      )
    : 0;

  if (levelValue) {
    levelValue.innerText =
      currentLevelNumber;
  }

  if (nextPointsValue) {
    nextPointsValue.innerText = nextLevel
      ? pointsToNextLevel
      : "0";
  }
}
async function loadNetworkStats() {
  try {
    const [statsResponse, latestBlock] =
      await Promise.all([
        fetch(`${BLOCKSCOUT_API}/stats`),
        fetchLatestBaseBlockNumber(),
      ]);

    if (!statsResponse.ok) {
      throw new Error(
        `Blockscout stats failed: ${statsResponse.status}`
      );
    }

    const stats = await statsResponse.json();

    setText(
      "networkWallets",
      Number(stats.total_addresses || 0).toLocaleString()
    );

    setText(
      "networkTx",
      Number(stats.total_transactions || 0).toLocaleString()
    );

    setText(
      "networkBlocks",
      Number(latestBlock || 0).toLocaleString()
    );
  } catch (err) {
    console.error("Load Base network stats failed:", err);

    setText("networkWallets", "Unavailable");
    setText("networkTx", "Unavailable");
    setText("networkBlocks", "Unavailable");
  }
}
async function fetchLatestBaseBlockNumber() {
  const response = await fetch(BASE_RPC, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Base RPC block request failed: HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  if (payload.error || !payload.result) {
    throw new Error(
      payload.error?.message || "Invalid block number response"
    );
  }

  return Number(BigInt(payload.result));
}
function formatCompact(num) {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}b`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}m`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}k`;
  return num.toFixed(2);
}

function getAnalyticsDateRange() {
  const today = new Date();
  const from = new Date(
    today.getFullYear() - 1,
    today.getMonth() + 1,
    1
  );

  return {
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

function getLastTwelveMonths() {
  const months = [];
  const today = new Date();

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth() - offset,
      1
    );

    months.push({
      key: `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`,
      label: date.toLocaleString("en-US", {
        month: "short",
      }),
    });
  }

  return months;
}

function getChartItems(data) {
  if (Array.isArray(data?.chart)) {
    return data.chart;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

function getItemDate(item) {
  const raw =
    item?.date ||
    item?.datetime ||
    item?.timestamp ||
    item?.time;

  if (!raw) return null;

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getItemValue(item) {
  const value =
    item?.value ??
    item?.count ??
    item?.transactions ??
    item?.amount ??
    0;

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function groupDailyValuesByMonth(
  items,
  mode = "sum"
) {
  const months = getLastTwelveMonths();
  const monthMap = new Map();

  for (const item of items) {
    const date = getItemDate(item);
    if (!date) continue;

    const key = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;

    const value = getItemValue(item);

    if (mode === "last") {
      monthMap.set(key, value);
    } else {
      monthMap.set(
        key,
        Number(monthMap.get(key) || 0) + value
      );
    }
  }

  return months.map((month) => ({
    month: month.label,
    count: Number(monthMap.get(month.key) || 0),
  }));
}

function calculateMonthlyGrowth(items) {
  const cumulative = groupDailyValuesByMonth(
    items,
    "last"
  );

  return cumulative.map((item, index) => {
    const previous =
      index > 0 ? cumulative[index - 1].count : 0;

    return {
      month: item.month,
      count: Math.max(item.count - previous, 0),
    };
  });
}

async function fetchBaseStatsLine(lineName) {
  const { from, to } = getAnalyticsDateRange();

  const url =
    `${BASE_STATS_API}/api/v1/lines/${lineName}` +
    `?from=${from}` +
    `&to=${to}` +
    `&resolution=DAY`;

  return fetchJsonWithTimeout(url);
}

function showChartLoading(message) {
  const chart = document.getElementById(
    "monthlyActiveWalletChart"
  );

  if (!chart) return;

  chart.innerHTML = `
    <div class="chart-loading">
      ${message}
    </div>
  `;
}
function formatChartValue(value) {
  const numericValue = Number(value || 0);

  if (numericValue >= 1_000_000_000) {
    return `${(numericValue / 1_000_000_000).toFixed(1)}B`;
  }

  if (numericValue >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(1)}M`;
  }

  if (numericValue >= 1_000) {
    return `${(numericValue / 1_000).toFixed(1)}K`;
  }

  return Math.round(numericValue).toLocaleString();
}
function renderMonthlyActiveWalletChart(data = []) {
  const chart = document.getElementById(
    "monthlyActiveWalletChart"
  );

  if (!chart) return;

  if (!Array.isArray(data) || data.length === 0) {
    chart.innerHTML = `
      <div class="chart-loading">
        No chart data available
      </div>
    `;
    return;
  }

  const values = data.map((item) =>
    Number(item.count || 0)
  );

  const maxValue = Math.max(...values, 1);

  chart.innerHTML = data
    .map((item) => {
      const value = Number(item.count || 0);

      const height =
        value > 0
          ? Math.max((value / maxValue) * 220, 10)
          : 4;

      return `
        <div
          class="monthly-bar-item"
          title="${item.month}: ${formatChartValue(value)}"
        >
          <div class="monthly-bar-value">
            ${formatChartValue(value)}
          </div>

          <div
            class="monthly-bar"
            style="height:${height}px"
          ></div>

          <div class="monthly-bar-label">
            ${item.month}
          </div>
        </div>
      `;
    })
    .join("");
}
async function loadMonthlyActiveWallets() {
  setAnalyticsActiveTab("wallets");

  showChartLoading(
    "Loading Base Mainnet active wallets..."
  );

  try {
    const data = await fetchBaseStatsLine(
      "activeAccounts"
    );

    const chartData = groupDailyValuesByMonth(
      getChartItems(data),
      "sum"
    );

    renderMonthlyActiveWalletChart(chartData);
  } catch (err) {
    console.error(
      "Load Base active wallets failed:",
      err
    );

    showChartLoading(
      "Failed to load Base active wallets"
    );
  }
}
const ANALYTICS_CHART_ID = "monthlyActiveWalletChart";

function getAnalyticsChartContainer() {
  return document.getElementById(ANALYTICS_CHART_ID);
}

function normalizeChartData(data = []) {
  return data
    .map((item, index) => ({
      label:
        item.label ??
        item.month ??
        item.date ??
        item.name ??
        String(index + 1),
      value: Number(item.value ?? item.total ?? item.count ?? 0),
    }))
    .filter((item) => Number.isFinite(item.value));
}

function formatCompactNumber(value, decimals = 1) {
  const number = Number(value || 0);
  const absolute = Math.abs(number);

  if (absolute >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(decimals)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(decimals)}M`;
  }

  if (absolute >= 1_000) {
    return `${(number / 1_000).toFixed(decimals)}K`;
  }

  return Math.round(number).toLocaleString();
}

function formatUSD(value) {
  const number = Number(value || 0);

  if (Math.abs(number) >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (Math.abs(number) >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1_000) {
    return `$${(number / 1_000).toFixed(1)}K`;
  }

  return `$${number.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function formatGwei(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(3)} gwei`;
  }

  return `${number.toFixed(number < 1 ? 3 : 2)} gwei`;
}

function escapeChartHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getChartDimensions(container) {
  const width = Math.max(container?.clientWidth || 760, 320);
  const height = width < 600 ? 320 : 370;

  return {
    width,
    height,
    padding: {
      top: 28,
      right: 22,
      bottom: 52,
      left: width < 600 ? 48 : 66,
    },
  };
}

function createChartScale(data, dimensions, options = {}) {
  const values = data.map((item) => item.value);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 1);

  const minValue =
    options.zeroBaseline === false
      ? rawMin - Math.abs(rawMax - rawMin) * 0.08
      : 0;

  const maxValue =
    rawMax + Math.max(Math.abs(rawMax - minValue) * 0.12, rawMax * 0.04, 1);

  const innerWidth =
    dimensions.width -
    dimensions.padding.left -
    dimensions.padding.right;

  const innerHeight =
    dimensions.height -
    dimensions.padding.top -
    dimensions.padding.bottom;

  const x = (index) => {
    if (data.length <= 1) {
      return dimensions.padding.left + innerWidth / 2;
    }

    return (
      dimensions.padding.left +
      (index / (data.length - 1)) * innerWidth
    );
  };

  const y = (value) => {
    const percentage =
      (Number(value) - minValue) / Math.max(maxValue - minValue, 1);

    return (
      dimensions.padding.top +
      innerHeight -
      percentage * innerHeight
    );
  };

  return {
    minValue,
    maxValue,
    innerWidth,
    innerHeight,
    x,
    y,
    baselineY: y(0),
  };
}

function createYAxisGrid({
  dimensions,
  scale,
  formatter = formatCompactNumber,
  lines = 4,
}) {
  const output = [];

  for (let index = 0; index <= lines; index += 1) {
    const percentage = index / lines;
    const value =
      scale.maxValue -
      percentage * (scale.maxValue - scale.minValue);

    const y =
      dimensions.padding.top +
      percentage * scale.innerHeight;

    output.push(`
      <line
        class="analytics-grid-line"
        x1="${dimensions.padding.left}"
        x2="${dimensions.width - dimensions.padding.right}"
        y1="${y}"
        y2="${y}"
      ></line>

      <text
        class="analytics-axis-value"
        x="${dimensions.padding.left - 10}"
        y="${y + 4}"
        text-anchor="end"
      >
        ${escapeChartHTML(formatter(value))}
      </text>
    `);
  }

  return output.join("");
}

function createXAxisLabels(data, dimensions, scale) {
  const maxLabels = dimensions.width < 600 ? 6 : 12;
  const step = Math.max(1, Math.ceil(data.length / maxLabels));

  return data
    .map((item, index) => {
      const shouldShow =
        index === 0 ||
        index === data.length - 1 ||
        index % step === 0;

      if (!shouldShow) {
        return "";
      }

      return `
        <text
          class="analytics-axis-label"
          x="${scale.x(index)}"
          y="${dimensions.height - 18}"
          text-anchor="middle"
        >
          ${escapeChartHTML(item.label)}
        </text>
      `;
    })
    .join("");
}

function createChartTooltip(container) {
  let tooltip = container.querySelector(".analytics-chart-tooltip");

  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "analytics-chart-tooltip";
    container.appendChild(tooltip);
  }

  return tooltip;
}

function attachChartTooltips(container, formatter = formatCompactNumber) {
  const tooltip = createChartTooltip(container);
  const targets = container.querySelectorAll("[data-chart-value]");

  targets.forEach((target) => {
    target.addEventListener("pointerenter", () => {
      const label = target.dataset.chartLabel || "";
      const value = Number(target.dataset.chartValue || 0);

      tooltip.innerHTML = `
        <span>${escapeChartHTML(label)}</span>
        <strong>${escapeChartHTML(formatter(value))}</strong>
      `;

      tooltip.classList.add("visible");
    });

    target.addEventListener("pointermove", (event) => {
      const bounds = container.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || 130;

      let left = event.clientX - bounds.left + 12;
      let top = event.clientY - bounds.top - 58;

      if (left + tooltipWidth > bounds.width - 10) {
        left = event.clientX - bounds.left - tooltipWidth - 12;
      }

      if (top < 10) {
        top = event.clientY - bounds.top + 18;
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });

    target.addEventListener("pointerleave", () => {
      tooltip.classList.remove("visible");
    });
  });
}

function renderEmptyAnalyticsChart(message = "No analytics data available") {
  const container = getAnalyticsChartContainer();

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="analytics-chart-empty">
      <span class="analytics-chart-empty-icon">◌</span>
      <strong>No data available</strong>
      <p>${escapeChartHTML(message)}</p>
    </div>
  `;
}

function renderChartSVG({
  data,
  className,
  content,
  formatter = formatCompactNumber,
}) {
  const container = getAnalyticsChartContainer();

  if (!container) {
    console.warn(`Chart container #${ANALYTICS_CHART_ID} was not found.`);
    return;
  }

  const normalizedData = normalizeChartData(data);

  if (!normalizedData.length) {
    renderEmptyAnalyticsChart();
    return;
  }

  const dimensions = getChartDimensions(container);
  const svgContent = content(normalizedData, dimensions);

  container.className = `analytics-chart-container ${className}`;
  container.innerHTML = `
    <svg
      class="network-analytics-svg"
      viewBox="0 0 ${dimensions.width} ${dimensions.height}"
      preserveAspectRatio="none"
      role="img"
      aria-label="Base network analytics chart"
    >
      ${svgContent}
    </svg>
  `;

  attachChartTooltips(container, formatter);
}
function setAnalyticsActiveTab(tabName) {
  document.querySelectorAll(".analytics-tab").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tabName
    );
  });
}

async function loadMonthlyTransactions() {
  const requestVersion = beginAnalyticsRequest(
    "tx",
    "Loading Base Mainnet transactions..."
  );

  try {
    const data = await fetchBaseStatsLine(
      "txnsGrowth"
    );

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "tx"
      )
    ) {
      return;
    }

    const chartData = calculateMonthlyGrowth(
      getChartItems(data)
    );

    renderMonthlyActiveWalletChart(chartData);
  } catch (error) {
    console.error(
      "Load Base transactions failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "tx"
      )
    ) {
      showChartLoading(
        "Failed to load Base transactions"
      );
    }
  }
}

function renderTransactionBarChart(data) {
  renderChartSVG({
    data,
    className: "chart-transactions",
    formatter: formatCompactNumber,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions);
      const slotWidth = scale.innerWidth / Math.max(items.length, 1);
      const barWidth = Math.min(Math.max(slotWidth * 0.54, 12), 46);

      const bars = items
        .map((item, index) => {
          const centerX =
            dimensions.padding.left +
            slotWidth * index +
            slotWidth / 2;

          const topY = scale.y(item.value);
          const height = Math.max(scale.baselineY - topY, 2);

          return `
            <g class="analytics-bar-group">
              <rect
                class="analytics-hit-area"
                x="${centerX - slotWidth / 2}"
                y="${dimensions.padding.top}"
                width="${slotWidth}"
                height="${scale.innerHeight}"
                data-chart-label="${escapeChartHTML(item.label)}"
                data-chart-value="${item.value}"
              ></rect>

              <rect
                class="transaction-bar"
                x="${centerX - barWidth / 2}"
                y="${topY}"
                width="${barWidth}"
                height="${height}"
                rx="8"
                ry="8"
              ></rect>

              <circle
                class="transaction-bar-cap"
                cx="${centerX}"
                cy="${topY + 4}"
                r="3"
              ></circle>
            </g>
          `;
        })
        .join("");

      return `
        <defs>
          <linearGradient id="transactionBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5b8cff"></stop>
            <stop offset="55%" stop-color="#165dff"></stop>
            <stop offset="100%" stop-color="#06389c"></stop>
          </linearGradient>

          <filter id="transactionBarGlow">
            <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatCompactNumber,
        })}

        ${bars}
        ${createXAxisLabels(items, dimensions, {
          x(index) {
            return (
              dimensions.padding.left +
              slotWidth * index +
              slotWidth / 2
            );
          },
        })}
      `;
    },
  });
}
async function loadMonthlyNewUsers() {
  const requestVersion = beginAnalyticsRequest(
    "newUsers",
    "Loading Base Mainnet new users..."
  );

  try {
    const data = await fetchBaseStatsLine(
      "newAccounts"
    );

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "newUsers"
      )
    ) {
      return;
    }

    const chartData = groupDailyValuesByMonth(
      getChartItems(data),
      "sum"
    );

    renderMonthlyActiveWalletChart(chartData);
  } catch (error) {
    console.error(
      "Load Base new users failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "newUsers"
      )
    ) {
      showChartLoading(
        "Failed to load Base new users"
      );
    }
  }
}

function renderNewAddressesAreaChart(data) {
  renderChartSVG({
    data,
    className: "chart-new-addresses",
    formatter: formatCompactNumber,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions);

      const linePoints = items
        .map((item, index) => `${scale.x(index)},${scale.y(item.value)}`)
        .join(" ");

      const areaPoints = [
        `${scale.x(0)},${scale.baselineY}`,
        linePoints,
        `${scale.x(items.length - 1)},${scale.baselineY}`,
      ].join(" ");

      const points = items
        .map(
          (item, index) => `
            <circle
              class="new-address-point"
              cx="${scale.x(index)}"
              cy="${scale.y(item.value)}"
              r="5"
              data-chart-label="${escapeChartHTML(item.label)}"
              data-chart-value="${item.value}"
            ></circle>
          `
        )
        .join("");

      return `
        <defs>
          <linearGradient id="newAddressAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3f7cff" stop-opacity="0.48"></stop>
            <stop offset="55%" stop-color="#155eef" stop-opacity="0.17"></stop>
            <stop offset="100%" stop-color="#155eef" stop-opacity="0"></stop>
          </linearGradient>

          <filter id="newAddressGlow">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatCompactNumber,
        })}

        <polygon
          class="new-address-area"
          points="${areaPoints}"
        ></polygon>

        <polyline
          class="new-address-line"
          points="${linePoints}"
        ></polyline>

        ${points}
        ${createXAxisLabels(items, dimensions, scale)}
      `;
    },
  });
}
async function loadTotalAddresses() {
  const requestVersion = beginAnalyticsRequest(
    "walletAge",
    "Loading total addresses..."
  );

  try {
    const data = await fetchBaseStatsLine(
      "accountsGrowth"
    );

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "walletAge"
      )
    ) {
      return;
    }

    const chartData = groupDailyValuesByMonth(
      getChartItems(data),
      "last"
    );

    renderMonthlyActiveWalletChart(chartData);
  } catch (error) {
    console.error(
      "Load total addresses failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "walletAge"
      )
    ) {
      showChartLoading(
        "Failed to load total addresses"
      );
    }
  }
}

function createSmoothPath(items, scale) {
  if (!items.length) {
    return "";
  }

  if (items.length === 1) {
    return `M ${scale.x(0)} ${scale.y(items[0].value)}`;
  }

  let path = `M ${scale.x(0)} ${scale.y(items[0].value)}`;

  for (let index = 0; index < items.length - 1; index += 1) {
    const currentX = scale.x(index);
    const currentY = scale.y(items[index].value);
    const nextX = scale.x(index + 1);
    const nextY = scale.y(items[index + 1].value);
    const midpointX = (currentX + nextX) / 2;

    path += ` C ${midpointX} ${currentY}, ${midpointX} ${nextY}, ${nextX} ${nextY}`;
  }

  return path;
}

function renderTotalAddressesLineChart(data) {
  renderChartSVG({
    data,
    className: "chart-total-addresses",
    formatter: formatCompactNumber,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions, {
        zeroBaseline: false,
      });

      const path = createSmoothPath(items, scale);

      const points = items
        .map(
          (item, index) => `
            <circle
              class="total-address-hit-point"
              cx="${scale.x(index)}"
              cy="${scale.y(item.value)}"
              r="12"
              data-chart-label="${escapeChartHTML(item.label)}"
              data-chart-value="${item.value}"
            ></circle>

            <circle
              class="total-address-point"
              cx="${scale.x(index)}"
              cy="${scale.y(item.value)}"
              r="4"
            ></circle>
          `
        )
        .join("");

      return `
        <defs>
          <linearGradient id="totalAddressLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#56b4ff"></stop>
            <stop offset="55%" stop-color="#326cff"></stop>
            <stop offset="100%" stop-color="#8c7dff"></stop>
          </linearGradient>

          <filter id="totalAddressGlow">
            <feGaussianBlur stdDeviation="6" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatCompactNumber,
        })}

        <path
          class="total-address-shadow-line"
          d="${path}"
        ></path>

        <path
          class="total-address-main-line"
          d="${path}"
        ></path>

        ${points}
        ${createXAxisLabels(items, dimensions, scale)}
      `;
    },
  });
}
async function loadMonthlyETHTransfers() {
  const requestVersion = beginAnalyticsRequest(
    "ethTransfers",
    "Loading ETH transfers..."
  );

  try {
    const data = await fetchBaseStatsLine(
      "newNativeCoinTransfers"
    );

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "ethTransfers"
      )
    ) {
      return;
    }

    const chartData = groupDailyValuesByMonth(
      getChartItems(data),
      "sum"
    );

    renderMonthlyActiveWalletChart(chartData);
  } catch (error) {
    console.error(
      "Load ETH transfers failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "ethTransfers"
      )
    ) {
      showChartLoading(
        "Failed to load ETH transfers"
      );
    }
  }
}

function renderETHTransfersChart(data) {
  renderChartSVG({
    data,
    className: "chart-eth-transfers",
    formatter: formatCompactNumber,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions);
      const slotWidth = scale.innerWidth / Math.max(items.length, 1);

      const columns = items
        .map((item, index) => {
          const x =
            dimensions.padding.left +
            slotWidth * index +
            slotWidth / 2;

          const y = scale.y(item.value);
          const columnWidth = Math.min(Math.max(slotWidth * 0.22, 5), 13);

          return `
            <g>
              <line
                class="eth-transfer-stem"
                x1="${x}"
                x2="${x}"
                y1="${scale.baselineY}"
                y2="${y}"
                stroke-width="${columnWidth}"
              ></line>

              <circle
                class="eth-transfer-orb"
                cx="${x}"
                cy="${y}"
                r="${Math.min(Math.max(columnWidth * 0.72, 5), 9)}"
                data-chart-label="${escapeChartHTML(item.label)}"
                data-chart-value="${item.value}"
              ></circle>
            </g>
          `;
        })
        .join("");

      return `
        <defs>
          <linearGradient id="ethTransferStemGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="#0d2863"></stop>
            <stop offset="60%" stop-color="#206cff"></stop>
            <stop offset="100%" stop-color="#8bc7ff"></stop>
          </linearGradient>

          <radialGradient id="ethTransferOrbGradient">
            <stop offset="0%" stop-color="#ffffff"></stop>
            <stop offset="25%" stop-color="#b8d8ff"></stop>
            <stop offset="100%" stop-color="#2774ff"></stop>
          </radialGradient>

          <filter id="ethTransferGlow">
            <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatCompactNumber,
        })}

        ${columns}

        ${createXAxisLabels(items, dimensions, {
          x(index) {
            return (
              dimensions.padding.left +
              slotWidth * index +
              slotWidth / 2
            );
          },
        })}
      `;
    },
  });
}

async function loadTVL() {
  const requestVersion = beginAnalyticsRequest(
    "tvl",
    "Loading TVL..."
  );

  try {
    const data = await fetchJsonWithTimeout(
      "https://api.llama.fi/v2/historicalChainTvl/Base"
    );

    if (!Array.isArray(data)) {
      throw new Error(
        "Invalid TVL response"
      );
    }

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "tvl"
      )
    ) {
      return;
    }

    const monthlyMap = new Map();

    for (const row of data.slice(-365)) {
      const date = new Date(
        Number(row?.date || 0) * 1000
      );

      const tvl = Number(row?.tvl);

      if (
        Number.isNaN(date.getTime()) ||
        !Number.isFinite(tvl)
      ) {
        continue;
      }

      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      monthlyMap.set(key, {
        month: date.toLocaleString(
          "en-US",
          { month: "short" }
        ),
        count: tvl,
      });
    }

    renderMonthlyActiveWalletChart(
      Array.from(monthlyMap.values()).slice(-12)
    );
  } catch (error) {
    console.error(
      "Load Base TVL failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "tvl"
      )
    ) {
      showChartLoading(
        "Failed to load Base TVL"
      );
    }
  }
}

function renderTVLAreaChart(data) {
  renderChartSVG({
    data,
    className: "chart-tvl",
    formatter: formatUSD,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions, {
        zeroBaseline: false,
      });

      const linePath = createSmoothPath(items, scale);

      const firstX = scale.x(0);
      const lastX = scale.x(items.length - 1);
      const bottomY =
        dimensions.height - dimensions.padding.bottom;

      const areaPath = `
        ${linePath}
        L ${lastX} ${bottomY}
        L ${firstX} ${bottomY}
        Z
      `;

      const points = items
        .map(
          (item, index) => `
            <circle
              class="tvl-hit-point"
              cx="${scale.x(index)}"
              cy="${scale.y(item.value)}"
              r="12"
              data-chart-label="${escapeChartHTML(item.label)}"
              data-chart-value="${item.value}"
            ></circle>
          `
        )
        .join("");

      const latestItem = items[items.length - 1];
      const latestX = scale.x(items.length - 1);
      const latestY = scale.y(latestItem.value);

      return `
        <defs>
          <linearGradient id="tvlAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#377dff" stop-opacity="0.55"></stop>
            <stop offset="55%" stop-color="#145aff" stop-opacity="0.18"></stop>
            <stop offset="100%" stop-color="#0b255d" stop-opacity="0"></stop>
          </linearGradient>

          <linearGradient id="tvlLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#5cc8ff"></stop>
            <stop offset="60%" stop-color="#3778ff"></stop>
            <stop offset="100%" stop-color="#145aff"></stop>
          </linearGradient>

          <filter id="tvlGlow">
            <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatUSD,
        })}

        <path class="tvl-area" d="${areaPath}"></path>
        <path class="tvl-line" d="${linePath}"></path>

        ${points}

        <circle
          class="tvl-latest-ring"
          cx="${latestX}"
          cy="${latestY}"
          r="9"
        ></circle>

        <circle
          class="tvl-latest-point"
          cx="${latestX}"
          cy="${latestY}"
          r="4"
        ></circle>

        ${createXAxisLabels(items, dimensions, scale)}
      `;
    },
  });
}
async function loadGasPrice() {
  const requestVersion = beginAnalyticsRequest(
    "gasPrice",
    "Loading recent Base gas prices..."
  );

  try {
    const payload = await fetchJsonWithTimeout(
      BASE_RPC,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_feeHistory",
          params: [
            "0x400",
            "latest",
            [],
          ],
        }),
      }
    );

    if (payload?.error) {
      throw new Error(payload.error.message);
    }

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "gasPrice"
      )
    ) {
      return;
    }

    const result = payload?.result;

    const baseFees = Array.isArray(
      result?.baseFeePerGas
    )
      ? result.baseFeePerGas.slice(0, -1)
      : [];

    if (baseFees.length < 2) {
      throw new Error(
        "No gas history returned"
      );
    }

    const oldestBlock = Number(
      BigInt(result.oldestBlock)
    );

    const rawData = baseFees.map(
      (hexValue, index) => ({
        block: oldestBlock + index,
        value:
          Number(BigInt(hexValue)) / 1e9,
      })
    );

    const numberOfBars = 12;

    const groupSize = Math.max(
      1,
      Math.floor(
        rawData.length / numberOfBars
      )
    );

    const chartData = [];

    for (
      let index = 0;
      index < rawData.length;
      index += groupSize
    ) {
      const group = rawData.slice(
        index,
        index + groupSize
      );

      if (!group.length) {
        continue;
      }

      const average =
        group.reduce(
          (sum, row) => sum + row.value,
          0
        ) / group.length;

      chartData.push({
        month: `#${group[
          group.length - 1
        ].block.toLocaleString()}`,
        count: average,
      });
    }

    renderGasPriceBarChart(
      chartData.slice(-12)
    );
  } catch (error) {
    console.error(
      "Load Base gas price failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "gasPrice"
      )
    ) {
      showChartLoading(
        "Failed to load Base gas price"
      );
    }
  }
}

function createStepPath(items, scale) {
  if (!items.length) {
    return "";
  }

  let path = `M ${scale.x(0)} ${scale.y(items[0].value)}`;

  for (let index = 1; index < items.length; index += 1) {
    const previousY = scale.y(items[index - 1].value);
    const currentX = scale.x(index);
    const currentY = scale.y(items[index].value);

    path += ` H ${currentX} V ${currentY}`;
  }

  return path;
}

function renderGasPriceLineChart(data) {
  renderChartSVG({
    data,
    className: "chart-gas-price",
    formatter: formatGwei,

    content(items, dimensions) {
      const scale = createChartScale(items, dimensions, {
        zeroBaseline: false,
      });

      const path = createStepPath(items, scale);

      const points = items
        .map(
          (item, index) => `
            <circle
              class="gas-price-hit-point"
              cx="${scale.x(index)}"
              cy="${scale.y(item.value)}"
              r="10"
              data-chart-label="${escapeChartHTML(item.label)}"
              data-chart-value="${item.value}"
            ></circle>

            <rect
              class="gas-price-square"
              x="${scale.x(index) - 3.5}"
              y="${scale.y(item.value) - 3.5}"
              width="7"
              height="7"
              rx="2"
            ></rect>
          `
        )
        .join("");

      return `
        <defs>
          <linearGradient id="gasPriceGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#8ad7ff"></stop>
            <stop offset="45%" stop-color="#4e91ff"></stop>
            <stop offset="100%" stop-color="#5361ff"></stop>
          </linearGradient>

          <filter id="gasPriceGlow">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>

        ${createYAxisGrid({
          dimensions,
          scale,
          formatter: formatGwei,
        })}

        <path
          class="gas-price-shadow"
          d="${path}"
        ></path>

        <path
          class="gas-price-line"
          d="${path}"
        ></path>

        ${points}
        ${createXAxisLabels(items, dimensions, scale)}
      `;
    },
  });
}
function renderGasPriceBarChart(data = []) {
  const chart = document.getElementById(
    "monthlyActiveWalletChart"
  );

  if (!chart) return;

  if (!Array.isArray(data) || !data.length) {
    showChartLoading("No gas price data");
    return;
  }

  const values = data.map((item) =>
    Number(item.count || 0)
  );

  const maxValue = Math.max(
    ...values,
    0.000001
  );

  chart.innerHTML = data
    .map((item) => {
      const value = Number(item.count || 0);

      const height = Math.max(
        (value / maxValue) * 220,
        8
      );

      return `
        <div
          class="monthly-bar-item"
          title="${item.month}: ${value.toFixed(6)} Gwei"
        >
          <div class="monthly-bar-value">
            ${value.toFixed(4)}
          </div>

          <div
            class="monthly-bar gas-price-bar"
            style="height:${height}px"
          ></div>

          <div class="monthly-bar-label gas-block-label">
            ${item.month}
          </div>
        </div>
      `;
    })
    .join("");
}
async function loadDailyGasUsed() {
  const requestVersion = beginAnalyticsRequest(
    "gasUsed",
    "Loading recent Base gas usage..."
  );

  try {
    const latestBlockPayload =
      await fetchJsonWithTimeout(
        BASE_RPC,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBlockByNumber",
            params: ["latest", false],
          }),
        }
      );

    if (latestBlockPayload?.error) {
      throw new Error(
        latestBlockPayload.error.message ||
        "Failed to load latest block"
      );
    }

    const gasLimit = Number(
      BigInt(
        latestBlockPayload.result.gasLimit
      )
    );

    const feeHistoryPayload =
      await fetchJsonWithTimeout(
        BASE_RPC,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "eth_feeHistory",
            params: [
              "0x400",
              "latest",
              [],
            ],
          }),
        }
      );

    if (feeHistoryPayload?.error) {
      throw new Error(
        feeHistoryPayload.error.message ||
        "eth_feeHistory failed"
      );
    }

    if (
      !isCurrentAnalyticsRequest(
        requestVersion,
        "gasUsed"
      )
    ) {
      return;
    }

    const result = feeHistoryPayload.result;

    const gasUsedRatios = Array.isArray(
      result?.gasUsedRatio
    )
      ? result.gasUsedRatio
      : [];

    if (gasUsedRatios.length < 2) {
      throw new Error(
        "Not enough gas usage history returned"
      );
    }

    const oldestBlock = Number(
      BigInt(result.oldestBlock)
    );

    const rawData = gasUsedRatios.map(
      (ratio, index) => ({
        block: oldestBlock + index,
        gasUsed:
          Number(ratio || 0) * gasLimit,
      })
    );

    const numberOfBars = 12;

    const groupSize = Math.max(
      1,
      Math.floor(
        rawData.length / numberOfBars
      )
    );

    const chartData = [];

    for (
      let index = 0;
      index < rawData.length;
      index += groupSize
    ) {
      const group = rawData.slice(
        index,
        index + groupSize
      );

      if (!group.length) {
        continue;
      }

      const averageGasUsed =
        group.reduce(
          (sum, row) => sum + row.gasUsed,
          0
        ) / group.length;

      chartData.push({
        month: `${Math.round(index + 1)}`,
        count: averageGasUsed,
      });
    }

    renderMonthlyActiveWalletChart(
      chartData.slice(-12)
    );
  } catch (error) {
    console.error(
      "Load recent Base gas used failed:",
      error
    );

    if (
      isCurrentAnalyticsRequest(
        requestVersion,
        "gasUsed"
      )
    ) {
      showChartLoading(
        "Failed to load Base gas usage"
      );
    }
  }
}

window.loadDailyGasUsed = loadDailyGasUsed;
window.loadGasPrice = loadGasPrice;

window.loadMonthlyTransactions = loadMonthlyTransactions;

window.loadMonthlyNewUsers = loadMonthlyNewUsers;

window.loadTotalAddresses = loadTotalAddresses;

window.loadMonthlyETHTransfers = loadMonthlyETHTransfers;

window.loadTVL = loadTVL;



function activeMultiplier(activeDays, walletAgeDays) {
  if (!walletAgeDays || walletAgeDays <= 0) return 0.2;

  const ratio = activeDays / walletAgeDays;

  if (ratio < 0.03) return 0.25;
  if (ratio < 0.10) return 0.45;
  if (ratio < 0.25) return 0.65;
  if (ratio < 0.50) return 0.85;
  return 1;
}

const openTrustModal = document.getElementById("openTrustModal");
const closeTrustModal = document.getElementById("closeTrustModal");
const trustModal = document.getElementById("trustModal");

if (openTrustModal && closeTrustModal && trustModal) {
  openTrustModal.addEventListener("click", () => {
    trustModal.classList.add("show");
  });

  closeTrustModal.addEventListener("click", () => {
    trustModal.classList.remove("show");
  });

  trustModal.addEventListener("click", (e) => {
    if (e.target === trustModal) {
      trustModal.classList.remove("show");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      trustModal.classList.remove("show");
    }
  });
}

window.claimCredentialNFT =
  claimCredentialNFT;

window.claimLevelNFT =
  claimLevelNFT;