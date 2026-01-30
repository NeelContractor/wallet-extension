import * as bip39 from 'bip39';
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import QRCode from 'qrcode';

console.log('Popup script loading with REAL blockchain integration...');

// State management
let state = {
  currentScreen: 'loading',
  seedPhrase: '',
  walletAddress: '',
  balance: 0, 
  password: '',
  publicKey: null,
  keypair: null,
  network: 'devnet',
  connection: null,
  transactions: [],
  isLoading: true,
  currentAccountIndex: 0,
  accounts: [],
  pendingApproval: null, // For approval popups
  swapQuote: null // For Jupiter swap
};

// Network configurations
const NETWORKS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com'
};

// Jupiter API endpoints - FIXED: Using correct production endpoint
const JUPITER_API_BASE = 'https://api.jup.ag';

// Get API key from manifest
function getApiKey() {
  try {
    const manifest = chrome.runtime.getManifest();
    return manifest.env?.JUP_API_KEY || '';
  } catch (error) {
    console.error('Error getting API key:', error);
    return '';
  }
}

// Initialize connection to Solana RPC
function initConnection() {
  const rpcUrl = NETWORKS[state.network];
  state.connection = new Connection(rpcUrl, 'confirmed');
  console.log('Connected to:', rpcUrl);
}

// Generate REAL BIP39 seed phrase
function generateSeedPhrase() {
  return bip39.generateMnemonic(128); // 12 words
}

// Validate seed phrase
function validateSeedPhrase(phrase) {
  return bip39.validateMnemonic(phrase.trim());
}

// Import wallet from private key
function importFromPrivateKey(privateKeyBase58) {
  try {
    // Decode base58 private key
    const privateKeyBytes = bs58.decode(privateKeyBase58.trim());
    
    // Validate length (should be 64 bytes for ed25519)
    if (privateKeyBytes.length !== 64) {
      throw new Error('Invalid private key length. Expected 64 bytes.');
    }
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    console.log('✅ Keypair imported from private key');
    return keypair;
  } catch (error) {
    console.error('Error importing private key:', error);
    throw new Error('Invalid private key format. Please check and try again.');
  }
}

// Generate REAL Solana keypair from seed with account index
function generateKeypairFromSeed(seedPhrase, accountIndex = 0) {
  try {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    const seed = bip39.mnemonicToSeedSync(seedPhrase, '');
    const derivationPath = `m/44'/501'/${accountIndex}'/0'`;
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    
    console.log(`Keypair generated successfully for account ${accountIndex}`);
    return keypair;
  } catch (error) {
    console.error('Error generating keypair:', error);
    throw error;
  }
}

// Decrypt wallet data
function decryptData(encryptedData, password) {
  try {
    const decrypted = atob(encryptedData);
    const passwordKey = password.repeat(Math.ceil(decrypted.length / password.length)).slice(0, decrypted.length);
    let decryptedStr = '';
    
    for (let i = 0; i < decrypted.length; i++) {
      decryptedStr += String.fromCharCode(decrypted.charCodeAt(i) ^ passwordKey.charCodeAt(i));
    }
    
    return JSON.parse(decryptedStr);
  } catch (error) {
    throw new Error('Invalid password or corrupted data');
  }
}

// Simple encryption
function encryptData(data, password) {
  const dataStr = JSON.stringify(data);
  const passwordKey = password.repeat(Math.ceil(dataStr.length / password.length)).slice(0, dataStr.length);
  let encrypted = '';
  
  for (let i = 0; i < dataStr.length; i++) {
    encrypted += String.fromCharCode(dataStr.charCodeAt(i) ^ passwordKey.charCodeAt(i));
  }
  
  return btoa(encrypted);
}

// Get private key in base58 format
function getPrivateKey() {
  if (!state.keypair) {
    throw new Error('Wallet not unlocked');
  }
  return bs58.encode(state.keypair.secretKey);
}

// Generate QR code for wallet address
async function generateQRCode(address) {
  try {
    const qrContainer = document.querySelector('.qr-placeholder');
    if (!qrContainer) return;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(address, {
      width: 200,
      margin: 2,
      color: {
        dark: '#0D0E12',
        light: '#FFFFFF'
      }
    });

    // Replace placeholder with actual QR code
    qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="width: 100%; height: 100%; border-radius: 13px;">`;
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

// REAL: Fetch balance from Solana blockchain
async function fetchBalance() {
  try {
    if (!state.connection || !state.publicKey) {
      console.log('Connection or public key not initialized');
      return;
    }

    console.log('Fetching balance for:', state.publicKey.toBase58());
    const balance = await state.connection.getBalance(state.publicKey);
    state.balance = balance / LAMPORTS_PER_SOL;
    
    console.log('✅ Balance fetched:', state.balance, 'SOL');

    // Update UI
    const balanceEl = document.getElementById('balanceAmount');
    if (balanceEl) {
      balanceEl.textContent = state.balance.toFixed(4);
    }

    // Fetch SOL price and update USD value
    const solPrice = await fetchSolPrice();
    const balanceUsdEl = document.getElementById('balanceUsd');
    if (balanceUsdEl) {
      balanceUsdEl.textContent = `≈ $${(state.balance * solPrice).toFixed(2)} USD`;
    }

    const availableEl = document.getElementById('availableBalance');
    if (availableEl) {
      availableEl.textContent = state.balance.toFixed(4);
    }

    chrome.storage.local.set({ balance: state.balance });
  } catch (error) {
    console.error('❌ Error fetching balance:', error);
  }
}

// REAL: Fetch SOL price from CoinGecko
async function fetchSolPrice() {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
    );
    const data = await response.json();
    return data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    return 150; // Fallback
  }
}

// REAL: Fetch transactions from blockchain with signatures
async function fetchTransactions() {
  try {
    if (!state.connection || !state.publicKey) {
      console.log('Connection or public key not initialized');
      return;
    }

    console.log('📋 Fetching transactions from blockchain...');
    
    const signatures = await state.connection.getSignaturesForAddress(
      state.publicKey,
      { limit: 10 }
    );

    console.log(`Found ${signatures.length} transactions`);

    if (signatures.length === 0) {
      updateActivityUI([]);
      return;
    }

    const transactions = [];
    
    for (const sig of signatures) {
      try {
        const tx = await state.connection.getParsedTransaction(
          sig.signature,
          { maxSupportedTransactionVersion: 0 }
        );

        if (tx && tx.meta) {
          const preBalance = tx.meta.preBalances[0] / LAMPORTS_PER_SOL;
          const postBalance = tx.meta.postBalances[0] / LAMPORTS_PER_SOL;
          const amount = Math.abs(postBalance - preBalance);
          const isReceived = postBalance > preBalance;

          transactions.push({
            signature: sig.signature,
            timestamp: sig.blockTime,
            type: isReceived ? 'received' : 'sent',
            amount: amount,
            status: sig.confirmationStatus,
            fee: tx.meta.fee / LAMPORTS_PER_SOL,
            slot: sig.slot
          });
        }
      } catch (error) {
        console.error('Error parsing transaction:', sig.signature, error);
      }
    }

    state.transactions = transactions;
    console.log(`✅ Parsed ${transactions.length} transactions`);
    
    updateActivityUI(transactions);
  } catch (error) {
    console.error('❌ Error fetching transactions:', error);
    updateActivityUI([]);
  }
}

// Update activity UI with REAL transaction data including clickable signatures
function updateActivityUI(transactions) {
  const activityList = document.getElementById('activityList');
  if (!activityList) return;

  if (transactions.length === 0) {
    activityList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-tertiary);">
        <p>No transactions yet</p>
        <p style="font-size: 12px; margin-top: 8px;">Send or receive SOL to see activity</p>
      </div>
    `;
    return;
  }

  activityList.innerHTML = transactions.map(tx => {
    const time = tx.timestamp 
      ? new Date(tx.timestamp * 1000).toLocaleString() 
      : 'Pending';
    const icon = tx.type === 'received' ? 'received' : 'sent';
    const amountClass = tx.type === 'received' ? 'positive' : '';
    const amountPrefix = tx.type === 'received' ? '+' : '-';
    const explorerUrl = `https://solscan.io/tx/${tx.signature}?cluster=${state.network}`;
    const shortSig = tx.signature.slice(0, 8) + '...' + tx.signature.slice(-8);
    
    return `
      <div class="activity-item" onclick="window.open('${explorerUrl}', '_blank')" style="cursor: pointer;" title="Click to view on explorer">
        <div class="activity-icon ${icon}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${tx.type === 'received' ? 
              '<polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line>' :
              '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>'
            }
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-type">${tx.type === 'received' ? 'Received' : 'Sent'}</div>
          <div class="activity-time">${time}</div>
          <a href="${explorerUrl}" target="_blank" class="activity-signature" onclick="event.stopPropagation()" style="font-size: 10px; color: var(--accent); margin-top: 2px; font-family: monospace; text-decoration: none;">${shortSig}</a>
        </div>
        <div class="activity-amount ${amountClass}">${amountPrefix}${tx.amount.toFixed(4)} SOL</div>
      </div>
    `;
  }).join('');
}

// REAL: Send transaction to blockchain
async function sendTransaction(recipientAddress, amount) {
  try {
    if (!state.connection || !state.keypair) {
      throw new Error('Wallet not initialized');
    }

    console.log('🚀 Preparing transaction...');
    
    const recipientPubkey = new PublicKey(recipientAddress);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: state.keypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: lamports
      })
    );

    const { blockhash } = await state.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = state.keypair.publicKey;

    console.log('✍️ Signing and sending transaction...');

    const signature = await state.connection.sendTransaction(
      transaction,
      [state.keypair],
      { skipPreflight: false }
    );

    console.log('📤 Transaction sent:', signature);

    const confirmation = await state.connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }

    console.log('✅ Transaction confirmed!');
    
    return signature;
  } catch (error) {
    console.error('❌ Transaction error:', error);
    throw error;
  }
}

// Jupiter Swap: Get quote - FIXED with correct endpoint
async function getSwapQuote(inputMint, outputMint, amount) {
  try {
    // Only works on mainnet
    if (state.network !== 'mainnet-beta') {
      throw new Error('Swaps only available on Mainnet');
    }
    
    const apiKey = getApiKey();
    const headers = {
      'Accept': 'application/json'
    };
    
    // Add API key if available
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const params = new URLSearchParams({
      inputMint: inputMint,
      outputMint: outputMint,
      amount: amount.toString(),
      slippageBps: '50' // 0.5% slippage
    });

    const quoteUrl = `${JUPITER_API_BASE}/swap/v1/quote?${params.toString()}`;
    console.log('🔍 Fetching quote from:', quoteUrl);

    const response = await fetch(quoteUrl, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter API error:', response.status, errorText);
      throw new Error(`Failed to get quote: ${response.status} ${response.statusText}`);
    }

    const quote = await response.json();
    console.log('✅ Swap quote received:', quote);
    
    return quote;
  } catch (error) {
    console.error('❌ Error getting swap quote:', error);
    throw error;
  }
}

// Jupiter Swap: Execute swap - FIXED
async function executeSwap(quoteResponse) {
  try {
    if (!state.keypair) {
      throw new Error('Wallet not unlocked');
    }

    const apiKey = getApiKey();
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add API key if available
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    console.log('🔄 Requesting swap transaction from Jupiter...');

    // Get swap transaction from Jupiter
    const response = await fetch(`${JUPITER_API_BASE}/swap/v1/swap`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        quoteResponse: quoteResponse,
        userPublicKey: state.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter swap API error:', response.status, errorText);
      throw new Error(`Failed to get swap transaction: ${response.status}`);
    }

    const swapData = await response.json();
    console.log('✅ Swap transaction received from Jupiter');
    
    if (!swapData.swapTransaction) {
      throw new Error('No swap transaction in response');
    }

    // Deserialize the transaction
    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = Transaction.from(transactionBuf);

    console.log('✍️ Signing and sending swap transaction...');

    // Sign and send the transaction
    const signature = await state.connection.sendTransaction(
      transaction,
      [state.keypair],
      { skipPreflight: false }
    );

    console.log('📤 Swap transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await state.connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Swap failed: ' + JSON.stringify(confirmation.value.err));
    }

    console.log('✅ Swap confirmed!');
    
    return signature;
  } catch (error) {
    console.error('❌ Swap error:', error);
    throw error;
  }
}

// Show approval popup for transactions
function showApprovalPopup(type, data) {
  return new Promise((resolve, reject) => {
    const approvalScreen = document.getElementById('approvalScreen');
    const approvalType = document.getElementById('approvalType');
    const approvalDetails = document.getElementById('approvalDetails');
    
    if (!approvalScreen || !approvalType || !approvalDetails) {
      reject(new Error('Approval UI not found'));
      return;
    }

    // Set approval data
    state.pendingApproval = { type, data, resolve, reject };

    // Update UI based on type
    if (type === 'transaction') {
      approvalType.textContent = 'Approve Transaction';
      approvalDetails.innerHTML = `
        <div class="approval-detail-row">
          <span>To:</span>
          <span class="monospace">${data.to.slice(0, 8)}...${data.to.slice(-8)}</span>
        </div>
        <div class="approval-detail-row">
          <span>Amount:</span>
          <span class="highlight">${data.amount} SOL</span>
        </div>
        <div class="approval-detail-row">
          <span>Network Fee:</span>
          <span>~0.000005 SOL</span>
        </div>
        <div class="approval-detail-row total">
          <span>Total:</span>
          <span class="highlight">${(parseFloat(data.amount) + 0.000005).toFixed(6)} SOL</span>
        </div>
      `;
    } else if (type === 'connect') {
      approvalType.textContent = 'Connection Request';
      approvalDetails.innerHTML = `
        <div class="approval-detail-row">
          <span>Site:</span>
          <span>${data.origin}</span>
        </div>
        <div class="approval-detail-row">
          <span>Requesting:</span>
          <span>View your public key</span>
        </div>
      `;
    }

    showScreen('approvalScreen');
  });
}

// Navigation
function showScreen(screenId) {
  console.log('Showing screen:', screenId);
  
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // Show the requested screen
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    state.currentScreen = screenId;
    console.log('✅ Screen shown:', screenId);
    
    // Generate QR code when showing receive screen
    if (screenId === 'receiveScreen' && state.walletAddress) {
      generateQRCode(state.walletAddress);
    }
  } else {
    console.error('❌ Screen not found:', screenId);
  }
}

// Copy to clipboard
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.style.background = 'var(--success)';
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

// Show recovery phrase 
function showRecoveryPhrase() {
  if (!state.seedPhrase) {
    alert('❌ Cannot export recovery phrase.\n\nThis wallet was imported from a private key, not a recovery phrase. You can only export the private key.');
    return;
  }

  const confirmed = confirm(
    '⚠️ WARNING ⚠️\n\n' +
    'Never share your recovery phrase with anyone!\n' +
    'Anyone with your recovery phrase can steal your funds.\n\n' +
    'Are you sure you want to reveal your recovery phrase?'
  );

  if (!confirmed) return;

  try {
    const words = state.seedPhrase.split(' ');
    const wordsList = words.map((word, i) => `${i + 1}. ${word}`).join('\n');
    
    // Show in a custom modal
    const modalHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
      " id="recoveryPhraseModal">
        <div style="
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        ">
          <h3 style="margin-bottom: 16px; color: var(--error);">⚠️ Recovery Phrase</h3>
          <div style="
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
            word-break: break-all;
            font-family: monospace;
            font-size: 11px;
            color: var(--text-primary);
            white-space: pre-line;
          ">${wordsList}</div>
          <div style="
            background: rgba(227, 123, 123, 0.08);
            border: 1px solid rgba(227, 123, 123, 0.25);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 16px;
            font-size: 11px;
            color: var(--error);
          ">
            ⚠️ Store this phrase safely offline. Never share it with anyone or enter it on untrusted websites.
          </div>
          <div style="display: flex; gap: 8px;">
            <button 
              id="copyRecoveryPhraseBtn"
              class="btn btn-secondary" 
              style="flex: 1;">
              Copy Words
            </button>
            <button 
              id="closeRecoveryPhraseModalBtn"
              class="btn btn-primary" 
              style="flex: 1;">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners after modal is in DOM
    const copyBtn = document.getElementById('copyRecoveryPhraseBtn');
    const closeBtn = document.getElementById('closeRecoveryPhraseModalBtn');
    
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(state.seedPhrase);
          copyBtn.textContent = '✓ Copied!';
          copyBtn.style.background = 'var(--success)';
          
          setTimeout(() => {
            copyBtn.textContent = 'Copy Words';
            copyBtn.style.background = '';
          }, 2000);
        } catch (err) {
          console.error('Copy failed:', err);
          alert('❌ Failed to copy to clipboard');
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('recoveryPhraseModal').remove();
      });
    }
  } catch (error) {
    alert('❌ Error getting recovery phrase: ' + error.message);
  }
}

if (settingsBtn) {
  settingsBtn.onclick = async () => {
    // Show settings menu - UPDATED WITH EXPORT PHRASE
    const settingsMenu = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
      " id="settingsModal">
        <div style="
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 24px;
          max-width: 300px;
          width: 100%;
        ">
          <h3 style="margin-bottom: 16px;">Settings</h3>
          <button 
            id="switchNetworkBtn"
            class="btn btn-secondary" 
            style="width: 100%; margin-bottom: 8px;">
            Switch Network (${state.network})
          </button>
          <button 
            id="showRecoveryPhraseBtn"
            class="btn btn-secondary" 
            style="width: 100%; margin-bottom: 8px;">
            Export Recovery Phrase
          </button>
          <button 
            id="showPrivateKeyBtn"
            class="btn btn-secondary" 
            style="width: 100%; margin-bottom: 8px;">
            Show Private Key
          </button>
          <button 
            id="closeSettingsBtn"
            class="btn btn-primary" 
            style="width: 100%;">
            Close
          </button>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', settingsMenu);
    
    const modal = document.getElementById('settingsModal');
    
    // Switch Network button
    document.getElementById('switchNetworkBtn').addEventListener('click', async () => {
      const currentNetwork = state.network;
      const newNetwork = currentNetwork === 'mainnet-beta' ? 'devnet' : 'mainnet-beta';
      
      if (confirm(`Switch from ${currentNetwork} to ${newNetwork}?\n\n⚠️ Make sure you have funds on the new network!`)) {
        const success = await switchNetwork(newNetwork);
        if (success) {
          modal.remove();
          alert(`✅ Switched to ${newNetwork}!\n\nBalance and transactions updated.`);
        } else {
          alert('❌ Failed to switch network');
        }
      }
    });
    
    document.getElementById('showRecoveryPhraseBtn').addEventListener('click', () => {
      modal.remove();
      showRecoveryPhrase();
    });
    
    // Show Private Key button
    document.getElementById('showPrivateKeyBtn').addEventListener('click', () => {
      modal.remove();
      showPrivateKey();
    });
    
    // Close button
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      modal.remove();
    });
  };
}

// Show private key 
function showPrivateKey() {
  if (!state.keypair) {
    alert('❌ Wallet not unlocked. Please reload and unlock your wallet.');
    return;
  }

  const confirmed = confirm(
    '⚠️ WARNING ⚠️\n\n' +
    'Never share your private key with anyone!\n' +
    'Anyone with your private key can steal your funds.\n\n' +
    'Are you sure you want to reveal your private key?'
  );

  if (!confirmed) return;

  try {
    const privateKey = getPrivateKey();
    
    // Show in a custom modal
    const modalHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
      " id="privateKeyModal">
        <div style="
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 100%;
        ">
          <h3 style="margin-bottom: 16px; color: var(--error);">⚠️ Private Key</h3>
          <div style="
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
            word-break: break-all;
            font-family: monospace;
            font-size: 11px;
            color: var(--text-primary);
          ">${privateKey}</div>
          <div style="display: flex; gap: 8px;">
            <button 
              id="copyPrivateKeyBtn"
              class="btn btn-secondary" 
              style="flex: 1;">
              Copy
            </button>
            <button 
              id="closePrivateKeyModalBtn"
              class="btn btn-primary" 
              style="flex: 1;">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners after modal is in DOM
    const copyBtn = document.getElementById('copyPrivateKeyBtn');
    const closeBtn = document.getElementById('closePrivateKeyModalBtn');
    
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(privateKey);
          copyBtn.textContent = '✓ Copied!';
          copyBtn.style.background = 'var(--success)';
          
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.style.background = '';
          }, 2000);
        } catch (err) {
          console.error('Copy failed:', err);
          alert('❌ Failed to copy to clipboard');
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('privateKeyModal').remove();
      });
    }
  } catch (error) {
    alert('❌ Error getting private key: ' + error.message);
  }
}

// Display seed phrase
function displaySeedPhrase() {
  const seedGrid = document.getElementById('seedGrid');
  if (!seedGrid) return;

  const words = state.seedPhrase.split(' ');
  seedGrid.innerHTML = words.map((word, i) => `
    <div class="seed-word">
      <span class="seed-word-num">${i + 1}.</span>
      <span class="seed-word-text">${word}</span>
    </div>
  `).join('');
}

// Load account from index
async function loadAccount(accountIndex) {
  try {
    if (!state.seedPhrase) {
      console.error('Seed phrase not available');
      return;
    }

    state.currentAccountIndex = accountIndex;
    state.keypair = generateKeypairFromSeed(state.seedPhrase, accountIndex);
    state.publicKey = state.keypair.publicKey;
    state.walletAddress = state.publicKey.toBase58();

    console.log(`✅ Loaded account ${accountIndex}:`, state.walletAddress);

    const shortAddress = state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
    const addressEl = document.getElementById('walletAddress');
    if (addressEl) addressEl.textContent = shortAddress;

    const receiveAddress = document.getElementById('receiveAddress');
    if (receiveAddress) receiveAddress.textContent = state.walletAddress;

    await chrome.storage.local.set({ currentAccountIndex: accountIndex });

    await fetchBalance();
    await fetchTransactions();
  } catch (error) {
    console.error('Error loading account:', error);
  }
}

// Update account selector UI
function updateAccountSelector() {
  const selector = document.getElementById('accountSelector');
  if (!selector) return;

  const accountCount = state.accounts.length || 1;
  selector.innerHTML = '';
  
  for (let i = 0; i < accountCount; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Account ${i + 1}`;
    if (i === state.currentAccountIndex) {
      option.selected = true;
    }
    selector.appendChild(option);
  }
}

// Load wallet data
async function loadWalletData(password = null) {
  try {
    const result = await chrome.storage.local.get([
      'encryptedWallet', 
      'network', 
      'accounts',
      'currentAccountIndex'
    ]);

    if (result.encryptedWallet && result.encryptedWallet.publicKey) {
      state.network = result.network || 'devnet';
      state.accounts = result.accounts || [0];
      state.currentAccountIndex = result.currentAccountIndex || 0;
      
      if (password && result.encryptedWallet.data) {
        try {
          const decryptedData = decryptData(result.encryptedWallet.data, password);
          
          if (decryptedData.seedPhrase) {
            // Wallet from seed phrase
            state.seedPhrase = decryptedData.seedPhrase;
            await loadAccount(state.currentAccountIndex);
            console.log('✅ Keypair restored from seed phrase');
          } else if (decryptedData.privateKey) {
            // Wallet from private key
            const privateKeyBytes = bs58.decode(decryptedData.privateKey);
            state.keypair = Keypair.fromSecretKey(privateKeyBytes);
            state.publicKey = state.keypair.publicKey;
            state.walletAddress = state.publicKey.toBase58();
            state.seedPhrase = null;
            console.log('✅ Keypair restored from private key');
          }
        } catch (error) {
          console.error('Failed to decrypt wallet data:', error);
        }
      } else {
        state.walletAddress = result.encryptedWallet.publicKey;
        state.publicKey = new PublicKey(state.walletAddress);
      }
      
      initConnection();
      updateAccountSelector();
      
      const shortAddress = state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
      const addressEl = document.getElementById('walletAddress');
      if (addressEl) addressEl.textContent = shortAddress;

      const networkEl = document.querySelector('.network');
      if (networkEl) {
        networkEl.textContent = state.network === 'mainnet-beta' ? 'Mainnet' : 
                                state.network === 'devnet' ? 'Devnet' : 'Testnet';
      }

      const receiveAddress = document.getElementById('receiveAddress');
      if (receiveAddress) receiveAddress.textContent = state.walletAddress;

      console.log('💫 Loading wallet data from blockchain...');
      await fetchBalance();
      await fetchTransactions();

      console.log('✅ Wallet loaded:', state.walletAddress);
    }
  } catch (error) {
    console.error('Error loading wallet:', error);
  }
}

// Check if wallet exists on startup
async function checkWalletExists() {
  try {
    state.isLoading = true;
    console.log('🔍 Checking for existing wallet...');
    
    const result = await chrome.storage.local.get(['encryptedWallet', 'hasWallet']);
    
    if (result.hasWallet && result.encryptedWallet && result.encryptedWallet.publicKey) {
      console.log('✅ Wallet found - showing unlock screen');
      showScreen('unlockScreen');
    } else {
      console.log('❌ No wallet found');
      showScreen('welcomeScreen');
    }
    
    state.isLoading = false;
  } catch (error) {
    console.error('Error checking wallet:', error);
    state.isLoading = false;
    showScreen('welcomeScreen');
  }
}

// Switch network - FIXED
async function switchNetwork(newNetwork) {
  try {
    state.network = newNetwork;
    await chrome.storage.local.set({ network: newNetwork });
    
    initConnection();
    
    const balanceEl = document.getElementById('balanceAmount');
    const balanceUsdEl = document.getElementById('balanceUsd');
    const activityList = document.getElementById('activityList');
    
    if (balanceEl) balanceEl.textContent = '...';
    if (balanceUsdEl) balanceUsdEl.textContent = 'Loading...';
    if (activityList) {
      activityList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-tertiary);">
          <p>Loading transactions...</p>
        </div>
      `;
    }
    
    const networkEl = document.querySelector('.network');
    if (networkEl) {
      networkEl.textContent = newNetwork === 'mainnet-beta' ? 'Mainnet' : 
                              newNetwork === 'devnet' ? 'Devnet' : 'Testnet';
    }
    
    console.log('🔄 Fetching data from new network:', newNetwork);
    await fetchBalance();
    await fetchTransactions();
    
    return true;
  } catch (error) {
    console.error('Error switching network:', error);
    return false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Solana Wallet...');
  
  showScreen('loadingScreen');
  await checkWalletExists();
  setupEventListeners();
});

function setupEventListeners() {
  // Unlock screen
  const unlockForm = document.getElementById('unlockForm');
  
  if (unlockForm) {
    unlockForm.onsubmit = async (e) => {
      e.preventDefault();
      
      const password = document.getElementById('unlockPassword').value;
      
      if (!password) {
        alert('Please enter your password');
        return;
      }
      
      try {
        const result = await chrome.storage.local.get(['encryptedWallet', 'currentAccountIndex']);
        
        if (result.encryptedWallet && result.encryptedWallet.data) {
          const decryptedData = decryptData(result.encryptedWallet.data, password);
          
          state.password = password;
          state.currentAccountIndex = result.currentAccountIndex || 0;
          
          // Check import method
          if (decryptedData.seedPhrase) {
            // Wallet imported from seed phrase
            state.seedPhrase = decryptedData.seedPhrase;
            state.keypair = generateKeypairFromSeed(state.seedPhrase, state.currentAccountIndex);
          } else if (decryptedData.privateKey) {
            // Wallet imported from private key
            const privateKeyBytes = bs58.decode(decryptedData.privateKey);
            state.keypair = Keypair.fromSecretKey(privateKeyBytes);
            state.seedPhrase = null; // No seed phrase for private key imports
          } else {
            alert('❌ Invalid wallet data');
            return;
          }
          
          console.log('✅ Wallet unlocked successfully');
          
          await loadWalletData(password);
          showScreen('mainScreen');
        } else {
          alert('❌ Wallet data not found');
        }
      } catch (error) {
        console.error('Unlock error:', error);
        alert('❌ Invalid password or corrupted wallet data');
      }
    };
  }

  // Welcome screen
  const createBtn = document.getElementById('createWalletBtn');
  const importBtn = document.getElementById('importWalletBtn');

  if (createBtn) {
    createBtn.onclick = () => showScreen('createPasswordScreen');
  }

  if (importBtn) {
    importBtn.onclick = () => showScreen('importWalletScreen');
  }

  // Import wallet screen
  const backFromImport = document.getElementById('backFromImport');
  const importForm = document.getElementById('importWalletForm');
  const phraseTab = document.getElementById('phraseTab');
  const privateKeyTab = document.getElementById('privateKeyTab');
  const phraseImportSection = document.getElementById('phraseImportSection');
  const privateKeyImportSection = document.getElementById('privateKeyImportSection');

  if (backFromImport) {
    backFromImport.onclick = () => showScreen('welcomeScreen');
  }

  // Tab switching for import methods
  if (phraseTab) {
    phraseTab.onclick = () => {
      phraseTab.classList.add('active');
      privateKeyTab.classList.remove('active');
      phraseImportSection.classList.add('active');
      privateKeyImportSection.classList.remove('active');
    };
  }

  if (privateKeyTab) {
    privateKeyTab.onclick = () => {
      privateKeyTab.classList.add('active');
      phraseTab.classList.remove('active');
      privateKeyImportSection.classList.add('active');
      phraseImportSection.classList.remove('active');
    };
  }

  if (importForm) {
    importForm.onsubmit = async (e) => {
      e.preventDefault();
      
      const password = document.getElementById('importPassword').value;
      const confirmPassword = document.getElementById('importConfirmPassword').value;

      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }

      if (password.length < 8) {
        alert('Password must be at least 8 characters!');
        return;
      }

      try {
        let keypair;
        let seedPhrase = null;
        let importMethod;

        // Check which import method is active
        if (phraseImportSection.classList.contains('active')) {
          // Import from seed phrase
          importMethod = 'phrase';
          seedPhrase = document.getElementById('importSeedPhrase').value.trim();
          
          if (!seedPhrase) {
            alert('❌ Please enter your recovery phrase!');
            return;
          }

          if (!validateSeedPhrase(seedPhrase)) {
            alert('❌ Invalid seed phrase! Please check and try again.');
            return;
          }

          keypair = generateKeypairFromSeed(seedPhrase, 0);
          state.seedPhrase = seedPhrase;
          
        } else {
          // Import from private key
          importMethod = 'privateKey';
          const privateKey = document.getElementById('importPrivateKey').value.trim();
          
          if (!privateKey) {
            alert('❌ Please enter your private key!');
            return;
          }

          if (privateKey.length < 87 || privateKey.length > 88) {
            alert('❌ Invalid private key length! Should be 87-88 characters.');
            return;
          }

          keypair = importFromPrivateKey(privateKey);
          
          // For private key imports, we don't have a seed phrase
          // Generate a dummy one for compatibility (this won't be used for recovery)
          state.seedPhrase = null;
        }

        state.password = password;
        state.currentAccountIndex = 0;
        state.keypair = keypair;
        state.publicKey = keypair.publicKey;
        state.walletAddress = state.publicKey.toBase58();
        state.accounts = [0];

        console.log('✅ Wallet imported via', importMethod, ':', state.walletAddress);

        // Prepare wallet data for encryption
        const walletData = {
          publicKey: state.walletAddress,
          importMethod: importMethod
        };

        // Only include seed phrase if we have one
        if (seedPhrase) {
          walletData.seedPhrase = seedPhrase;
        } else {
          // For private key imports, store the keypair directly
          walletData.privateKey = bs58.encode(keypair.secretKey);
        }

        const encrypted = encryptData(walletData, state.password);

        await chrome.storage.local.set({
          encryptedWallet: {
            data: encrypted,
            publicKey: state.walletAddress,
            importMethod: importMethod
          },
          network: 'devnet',
          hasWallet: true,
          accounts: [0],
          currentAccountIndex: 0
        });

        state.network = 'devnet';
        initConnection();

        await loadWalletData(password);
        showScreen('mainScreen');

        if (importMethod === 'phrase') {
          alert('✅ Wallet imported from recovery phrase!\n\nYou\'re on Devnet (safe for testing).');
        } else {
          alert('✅ Wallet imported from private key!\n\nYou\'re on Devnet (safe for testing).\n\n⚠️ Note: You won\'t be able to derive additional accounts from this wallet.');
        }
        
        // Clear input fields
        document.getElementById('importSeedPhrase').value = '';
        document.getElementById('importPrivateKey').value = '';
        document.getElementById('importPassword').value = '';
        document.getElementById('importConfirmPassword').value = '';
        
      } catch (error) {
        console.error('Error importing wallet:', error);
        alert('❌ Error importing wallet: ' + error.message);
      }
    };
  }

  // Password screen
  const passwordForm = document.getElementById('createPasswordForm');
  const backToWelcome = document.getElementById('backToWelcome');

  if (backToWelcome) {
    backToWelcome.onclick = () => showScreen('welcomeScreen');
  }

  if (passwordForm) {
    passwordForm.onsubmit = (e) => {
      e.preventDefault();
      
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }

      if (password.length < 8) {
        alert('Password must be at least 8 characters!');
        return;
      }

      state.password = password;
      state.seedPhrase = generateSeedPhrase();
      
      displaySeedPhrase();
      showScreen('seedBackupScreen');
    };
  }

  // Seed backup screen
  const revealBtn = document.getElementById('revealSeedBtn');
  const copySeedBtn = document.getElementById('copySeedBtn');
  const confirmSeedBtn = document.getElementById('confirmSeedBtn');

  if (revealBtn) {
    revealBtn.onclick = () => {
      const seedGrid = document.getElementById('seedGrid');
      if (seedGrid) seedGrid.classList.add('revealed');
      revealBtn.classList.add('hidden');
      if (copySeedBtn) copySeedBtn.style.display = 'block';
      if (confirmSeedBtn) confirmSeedBtn.disabled = false;
    };
  }

  if (copySeedBtn) {
    copySeedBtn.onclick = function() {
      copyToClipboard(state.seedPhrase, this);
    };
  }

  if (confirmSeedBtn) {
    confirmSeedBtn.onclick = async () => {
      try {
        state.currentAccountIndex = 0;
        state.keypair = generateKeypairFromSeed(state.seedPhrase, 0);
        state.publicKey = state.keypair.publicKey;
        state.walletAddress = state.publicKey.toBase58();
        state.accounts = [0];

        console.log('✅ Wallet created:', state.walletAddress);

        const walletData = {
          seedPhrase: state.seedPhrase,
          publicKey: state.walletAddress
        };

        const encrypted = encryptData(walletData, state.password);

        await chrome.storage.local.set({
          encryptedWallet: {
            data: encrypted,
            publicKey: state.walletAddress
          },
          network: 'devnet',
          hasWallet: true,
          accounts: [0],
          currentAccountIndex: 0
        });

        state.network = 'devnet';
        initConnection();

        await loadWalletData();
        showScreen('mainScreen');

        alert('✅ Wallet created successfully!\n\nYou\'re on Devnet (safe for testing).\n\nGet free test SOL at: https://faucet.solana.com');
      } catch (error) {
        console.error('Error creating wallet:', error);
        alert('❌ Error creating wallet: ' + error.message);
      }
    };
  }

  // Main screen
  const copyAddressBtn = document.getElementById('copyAddressBtn');
  if (copyAddressBtn) {
    copyAddressBtn.onclick = function() {
      copyToClipboard(state.walletAddress, this);
    };
  }

  const accountSelector = document.getElementById('accountSelector');
  if (accountSelector) {
    accountSelector.onchange = async (e) => {
      const newAccountIndex = parseInt(e.target.value);
      console.log('Switching to account:', newAccountIndex);
      await loadAccount(newAccountIndex);
    };
  }

  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) {
    addAccountBtn.onclick = async () => {
      if (!state.seedPhrase) {
        alert('❌ Cannot create additional accounts.\n\nThis wallet was imported from a private key. Only wallets imported from a recovery phrase can derive multiple accounts.');
        return;
      }

      const confirmed = confirm(
        `Create a new account?\n\nThis will be Account ${state.accounts.length + 1} derived from your seed phrase.`
      );

      if (confirmed) {
        const newAccountIndex = state.accounts.length;
        state.accounts.push(newAccountIndex);

        await chrome.storage.local.set({ 
          accounts: state.accounts 
        });

        updateAccountSelector();
        await loadAccount(newAccountIndex);

        alert(`✅ Account ${newAccountIndex + 1} created!`);
      }
    };
  }

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) {
    sendBtn.onclick = () => {
      const availableBalance = document.getElementById('availableBalance');
      if (availableBalance) {
        availableBalance.textContent = state.balance.toFixed(4);
      }
      showScreen('sendScreen');
    };
  }

  const receiveBtn = document.getElementById('receiveBtn');
  if (receiveBtn) {
    receiveBtn.onclick = () => {
      const receiveAddress = document.getElementById('receiveAddress');
      if (receiveAddress) receiveAddress.textContent = state.walletAddress;
      showScreen('receiveScreen');
    };
  }

  const swapBtn = document.getElementById('swapBtn');
  if (swapBtn) {
    swapBtn.onclick = () => {
      showScreen('swapScreen');
    };
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.onclick = async () => {
      // Show settings menu - FIXED
      const settingsMenu = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        " id="settingsModal">
          <div style="
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 24px;
            max-width: 300px;
            width: 100%;
          ">
            <h3 style="margin-bottom: 16px;">Settings</h3>
            <button 
              id="switchNetworkBtn"
              class="btn btn-secondary" 
              style="width: 100%; margin-bottom: 8px;">
              Switch Network (${state.network})
            </button>
            <button 
              id="showRecoveryPhraseBtn"
              class="btn btn-secondary" 
              style="width: 100%; margin-bottom: 8px;">
              Show Recovery Phrase
            </button>
            <button 
              id="showPrivateKeyBtn"
              class="btn btn-secondary" 
              style="width: 100%; margin-bottom: 8px;">
              Show Private Key
            </button>
            <button 
              id="closeSettingsBtn"
              class="btn btn-primary" 
              style="width: 100%;">
              Close
            </button>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', settingsMenu);
      
      const modal = document.getElementById('settingsModal');
      
      // Switch Network button
      document.getElementById('switchNetworkBtn').addEventListener('click', async () => {
        const currentNetwork = state.network;
        const newNetwork = currentNetwork === 'mainnet-beta' ? 'devnet' : 'mainnet-beta';
        
        if (confirm(`Switch from ${currentNetwork} to ${newNetwork}?\n\n⚠️ Make sure you have funds on the new network!`)) {
          const success = await switchNetwork(newNetwork);
          if (success) {
            modal.remove();
            alert(`✅ Switched to ${newNetwork}!\n\nBalance and transactions updated.`);
          } else {
            alert('❌ Failed to switch network');
          }
        }
      });
      
      // Show Recovery Phrase Key button
      document.getElementById('showRecoveryPhraseBtn').addEventListener('click', () => {
        modal.remove();
        showRecoveryPhrase();
      });

      // Show Private Key button
      document.getElementById('showPrivateKeyBtn').addEventListener('click', () => {
        modal.remove();
        showPrivateKey();
      });
      
      // Close button
      document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        modal.remove();
      });
    };
  }

  // Send screen
  const backFromSend = document.getElementById('backFromSend');
  const sendForm = document.getElementById('sendForm');
  const sendAmountInput = document.getElementById('sendAmount');

  if (backFromSend) {
    backFromSend.onclick = () => showScreen('mainScreen');
  }

  if (sendAmountInput) {
    sendAmountInput.oninput = (e) => {
      const amount = parseFloat(e.target.value) || 0;
      const fee = 0.000005;
      const totalAmountEl = document.getElementById('totalAmount');
      if (totalAmountEl) {
        totalAmountEl.textContent = (amount + fee).toFixed(6) + ' SOL';
      }
    };
  }

  if (sendForm) {
    sendForm.onsubmit = async (e) => {
      e.preventDefault();
      
      const recipient = document.getElementById('recipientAddress').value.trim();
      const amount = parseFloat(document.getElementById('sendAmount').value);

      if (!recipient || recipient.length < 32) {
        alert('❌ Please enter a valid Solana address!');
        return;
      }

      if (amount <= 0) {
        alert('❌ Please enter a valid amount!');
        return;
      }

      if (amount > state.balance) {
        alert(`❌ Insufficient balance!\n\nAvailable: ${state.balance.toFixed(4)} SOL`);
        return;
      }

      if (!state.keypair) {
        alert('❌ Wallet not unlocked. Please reload and unlock your wallet.');
        return;
      }

      // Show approval popup INSIDE EXTENSION
      try {
        await showApprovalPopup('transaction', {
          to: recipient,
          amount: amount.toString()
        });

        // User approved - hide approval screen and continue
        showScreen('sendScreen');

        const submitBtn = sendForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        const signature = await sendTransaction(recipient, amount);

        const explorerUrl = `https://solscan.io/tx/${signature}?cluster=${state.network}`;
        alert(`✅ Transaction successful!\n\nSignature: ${signature}\n\nClick OK to view on explorer.`);
        window.open(explorerUrl, '_blank');

        document.getElementById('recipientAddress').value = '';
        document.getElementById('sendAmount').value = '';

        await fetchBalance();
        await fetchTransactions();

        showScreen('mainScreen');
      } catch (error) {
        if (error.message !== 'User rejected') {
          console.error('Transaction failed:', error);
          alert(`❌ Transaction failed:\n\n${error.message}`);
        } else {
          // User rejected - just go back to send screen
          showScreen('sendScreen');
        }
      } finally {
        const submitBtn = sendForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.textContent = 'Review Transaction';
          submitBtn.disabled = false;
        }
      }
    };
  }

  // Receive screen
  const backFromReceive = document.getElementById('backFromReceive');
  const copyReceiveAddressBtn = document.getElementById('copyReceiveAddressBtn');

  if (backFromReceive) {
    backFromReceive.onclick = () => showScreen('mainScreen');
  }

  if (copyReceiveAddressBtn) {
    copyReceiveAddressBtn.onclick = function() {
      copyToClipboard(state.walletAddress, this);
    };
  }

  // Swap screen
  const backFromSwap = document.getElementById('backFromSwap');
  const swapForm = document.getElementById('swapForm');
  const swapInAmount = document.getElementById('swapInAmount');

  if (backFromSwap) {
    backFromSwap.onclick = () => {
      // Clear swap data when going back
      document.getElementById('swapInAmount').value = '';
      document.getElementById('swapOutAmount').value = '';
      state.swapQuote = null;
      showScreen('mainScreen');
    };
  }

  if (swapInAmount) {
    swapInAmount.oninput = async (e) => {
      const amount = parseFloat(e.target.value) || 0;
      const swapOutAmount = document.getElementById('swapOutAmount');
      const swapRate = document.getElementById('swapRate');
      
      if (amount > 0) {
        try {
          // Show loading state
          if (swapOutAmount) swapOutAmount.value = 'Loading...';
          if (swapRate) swapRate.textContent = 'Fetching...';
          
          // SOL mint address (native SOL)
          const SOL_MINT = 'So11111111111111111111111111111111111111112';
          // USDC mint address on mainnet
          const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
          
          const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
          
          console.log('Fetching swap quote for', amount, 'SOL (', lamports, 'lamports)');
          
          const quote = await getSwapQuote(SOL_MINT, USDC_MINT, lamports);
          
          if (quote && quote.outAmount) {
            const outAmount = quote.outAmount / 1000000; // USDC has 6 decimals
            if (swapOutAmount) {
              swapOutAmount.value = outAmount.toFixed(2);
            }
            
            // Calculate and display exchange rate
            const rate = outAmount / amount;
            if (swapRate) {
              swapRate.textContent = `1 SOL ≈ ${rate.toFixed(2)} USDC`;
            }
            
            state.swapQuote = quote;
            console.log('✅ Quote received:', outAmount, 'USDC');
          }
        } catch (error) {
          console.error('Error getting quote:', error);
          if (swapOutAmount) swapOutAmount.value = 'Error';
          if (swapRate) swapRate.textContent = 'Failed to fetch';
          
          // Show user-friendly error
          if (error.message.includes('Failed to get quote')) {
            alert('⚠️ Unable to get swap quote. Make sure you\'re on Mainnet and try again.');
          }
        }
      } else {
        // Clear outputs when amount is 0
        if (swapOutAmount) swapOutAmount.value = '';
        if (swapRate) swapRate.textContent = 'Fetching...';
        state.swapQuote = null;
      }
    };
  }

  if (swapForm) {
    swapForm.onsubmit = async (e) => {
      e.preventDefault();
      
      if (state.network !== 'mainnet-beta') {
        alert('⚠️ Swaps are only available on Mainnet!\n\nPlease switch to Mainnet in settings.');
        return;
      }

      if (!state.swapQuote) {
        alert('❌ Please enter an amount to get a quote first!');
        return;
      }

      if (!state.keypair) {
        alert('❌ Wallet not unlocked. Please reload and unlock your wallet.');
        return;
      }

      const confirmed = confirm(
        `Confirm Swap?\n\nYou pay: ${swapInAmount.value} SOL\nYou receive: ~${document.getElementById('swapOutAmount').value} USDC\n\nProceed?`
      );

      if (!confirmed) return;

      try {
        const submitBtn = swapForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Swapping...';
        submitBtn.disabled = true;

        const signature = await executeSwap(state.swapQuote);

        const explorerUrl = `https://solscan.io/tx/${signature}?cluster=mainnet`;
        alert(`✅ Swap successful!\n\nSignature: ${signature}\n\nClick OK to view on explorer.`);
        window.open(explorerUrl, '_blank');

        document.getElementById('swapInAmount').value = '';
        document.getElementById('swapOutAmount').value = '';
        state.swapQuote = null;

        await fetchBalance();
        await fetchTransactions();

        showScreen('mainScreen');
      } catch (error) {
        console.error('Swap failed:', error);
        alert(`❌ Swap failed:\n\n${error.message}`);
      } finally {
        const submitBtn = swapForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.textContent = 'Execute Swap';
          submitBtn.disabled = false;
        }
      }
    };
  }

  // Approval screen
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');

  if (approveBtn) {
    approveBtn.onclick = () => {
      if (state.pendingApproval) {
        state.pendingApproval.resolve();
        state.pendingApproval = null;
      }
    };
  }

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      if (state.pendingApproval) {
        state.pendingApproval.reject(new Error('User rejected'));
        state.pendingApproval = null;
        showScreen('sendScreen');
      }
    };
  }
}

// Auto-refresh every 30 seconds
setInterval(async () => {
  if (state.currentScreen === 'mainScreen' && state.publicKey) {
    console.log('🔄 Auto-refreshing...');
    await fetchBalance();
    await fetchTransactions();
  }
}, 30000);

console.log('✅ Popup script loaded');