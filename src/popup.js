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
  currentAccountIndex: 0, // Support multiple accounts
  accounts: [] // Store multiple accounts
};

// Network configurations
const NETWORKS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com'
};

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

// Generate REAL Solana keypair from seed with account index
function generateKeypairFromSeed(seedPhrase, accountIndex = 0) {
  try {
    if (!bip39.validateMnemonic(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    const seed = bip39.mnemonicToSeedSync(seedPhrase, '');
    // Derive different accounts using different paths
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

// REAL: Fetch transactions from blockchain
async function fetchTransactions() {
  try {
    if (!state.connection || !state.publicKey) {
      console.log('Connection or public key not initialized');
      return;
    }

    console.log('📋 Fetching transactions from blockchain...');
    
    // Get transaction signatures
    const signatures = await state.connection.getSignaturesForAddress(
      state.publicKey,
      { limit: 10 }
    );

    console.log(`Found ${signatures.length} transactions`);

    if (signatures.length === 0) {
      updateActivityUI([]);
      return;
    }

    // Parse each transaction
    const transactions = [];
    
    for (const sig of signatures) {
      try {
        const tx = await state.connection.getParsedTransaction(
          sig.signature,
          { maxSupportedTransactionVersion: 0 }
        );

        if (tx && tx.meta) {
          // Calculate balance change
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
            fee: tx.meta.fee / LAMPORTS_PER_SOL
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

// Update activity UI with REAL transaction data
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
    
    return `
      <div class="activity-item" onclick="window.open('${explorerUrl}', '_blank')" style="cursor: pointer;">
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

    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: state.keypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: lamports
      })
    );

    // Get recent blockhash
    const { blockhash } = await state.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = state.keypair.publicKey;

    console.log('✍️ Signing and sending transaction...');

    // Sign and send
    const signature = await state.connection.sendTransaction(
      transaction,
      [state.keypair],
      { skipPreflight: false }
    );

    console.log('📤 Transaction sent:', signature);

    // Wait for confirmation
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

// Navigation
function showScreen(screenId) {
  console.log('Showing screen:', screenId);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    state.currentScreen = screenId;
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

    // Update UI
    const shortAddress = state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
    const addressEl = document.getElementById('walletAddress');
    if (addressEl) addressEl.textContent = shortAddress;

    const receiveAddress = document.getElementById('receiveAddress');
    if (receiveAddress) receiveAddress.textContent = state.walletAddress;

    // Save current account index
    await chrome.storage.local.set({ currentAccountIndex: accountIndex });

    // Fetch data for this account
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
      state.accounts = result.accounts || [0]; // At least one account
      state.currentAccountIndex = result.currentAccountIndex || 0;
      
      // Try to restore keypair from encrypted data if password is provided
      if (password && result.encryptedWallet.data) {
        try {
          const decryptedData = decryptData(result.encryptedWallet.data, password);
          if (decryptedData.seedPhrase) {
            state.seedPhrase = decryptedData.seedPhrase;
            
            // Load current account
            await loadAccount(state.currentAccountIndex);
            
            console.log('✅ Keypair restored from encrypted storage');
          }
        } catch (error) {
          console.error('Failed to decrypt wallet data:', error);
          // Continue without keypair - user will need to unlock
        }
      } else {
        // Just load public key info without keypair
        state.walletAddress = result.encryptedWallet.publicKey;
        state.publicKey = new PublicKey(state.walletAddress);
      }
      
      // Initialize connection
      initConnection();

      // Update UI
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

      // Fetch REAL data from blockchain
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Solana Wallet...');
  
  // Show loading screen first
  showScreen('loadingScreen');
  
  // Check if wallet exists
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
          // Try to decrypt
          const decryptedData = decryptData(result.encryptedWallet.data, password);
          
          if (decryptedData.seedPhrase) {
            state.password = password;
            state.seedPhrase = decryptedData.seedPhrase;
            state.currentAccountIndex = result.currentAccountIndex || 0;
            state.keypair = generateKeypairFromSeed(state.seedPhrase, state.currentAccountIndex);
            
            console.log('✅ Wallet unlocked successfully');
            
            // Load wallet and show main screen
            await loadWalletData(password);
            showScreen('mainScreen');
          } else {
            alert('❌ Invalid password');
          }
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
    importBtn.onclick = () => {
      alert('Import functionality coming soon!');
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
      state.seedPhrase = generateSeedPhrase(); // REAL BIP39
      
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
        // Generate REAL keypair from seed (account 0)
        state.currentAccountIndex = 0;
        state.keypair = generateKeypairFromSeed(state.seedPhrase, 0);
        state.publicKey = state.keypair.publicKey;
        state.walletAddress = state.publicKey.toBase58();
        state.accounts = [0]; // Initialize with first account

        console.log('✅ Wallet created:', state.walletAddress);

        // Save encrypted wallet
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

  // Account selector
  const accountSelector = document.getElementById('accountSelector');
  if (accountSelector) {
    accountSelector.onchange = async (e) => {
      const newAccountIndex = parseInt(e.target.value);
      console.log('Switching to account:', newAccountIndex);
      await loadAccount(newAccountIndex);
    };
  }

  // Add account button
  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) {
    addAccountBtn.onclick = async () => {
      if (!state.seedPhrase) {
        alert('❌ Wallet not unlocked. Please reload and unlock your wallet.');
        return;
      }

      const confirmed = confirm(
        `Create a new account?\n\nThis will be Account ${state.accounts.length + 1} derived from your seed phrase.`
      );

      if (confirmed) {
        const newAccountIndex = state.accounts.length;
        state.accounts.push(newAccountIndex);

        // Save accounts list
        await chrome.storage.local.set({ 
          accounts: state.accounts 
        });

        // Update selector
        updateAccountSelector();

        // Load the new account
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
    swapBtn.onclick = () => alert('Swap coming soon!');
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.onclick = async () => {
      const currentNetwork = state.network;
      const newNetwork = currentNetwork === 'mainnet-beta' ? 'devnet' : 'mainnet-beta';
      
      const confirmed = confirm(
        `Switch from ${currentNetwork} to ${newNetwork}?\n\n⚠️ Make sure you have funds on the new network!`
      );
      
      if (confirmed) {
        // Update network
        state.network = newNetwork;
        await chrome.storage.local.set({ network: newNetwork });
        
        // Reinitialize connection with new network
        initConnection();
        
        // Update UI to show loading
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
        
        // Update network display
        const networkEl = document.querySelector('.network');
        if (networkEl) {
          networkEl.textContent = newNetwork === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
        }
        
        // Fetch fresh data from new network
        console.log('🔄 Fetching data from new network:', newNetwork);
        await fetchBalance();
        await fetchTransactions();
        
        alert(`✅ Switched to ${newNetwork}!\n\nBalance and transactions updated.`);
      }
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

      // Check if wallet is unlocked
      if (!state.keypair) {
        alert('❌ Wallet not unlocked. Please reload and unlock your wallet.');
        return;
      }

      const confirmed = confirm(
        `Send ${amount} SOL to:\n${recipient.slice(0, 8)}...${recipient.slice(-8)}?\n\nNetwork: ${state.network}\nFee: ~0.000005 SOL`
      );

      if (!confirmed) return;

      try {
        const submitBtn = sendForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        // Send REAL transaction
        const signature = await sendTransaction(recipient, amount);

        alert(`✅ Transaction successful!\n\nSignature: ${signature}\n\nView on Solscan:\nhttps://solscan.io/tx/${signature}?cluster=${state.network}`);

        document.getElementById('recipientAddress').value = '';
        document.getElementById('sendAmount').value = '';

        // Refresh data
        await fetchBalance();
        await fetchTransactions();

        showScreen('mainScreen');
      } catch (error) {
        console.error('Transaction failed:', error);
        alert(`❌ Transaction failed:\n\n${error.message}`);
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