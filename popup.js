// State management
let state = {
    currentScreen: 'welcome',
    seedPhrase: '',
    walletAddress: '',
    balance: 0,
    password: '',
    publicKey: ''
  };
  
  // Generate seed phrase (mock - use bip39 in production)
  function generateSeedPhrase() {
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'acoustic', 'acquire', 'across',
      'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address',
      'adjust', 'admit', 'adult', 'advance', 'advice', 'aerobic', 'afford', 'afraid',
      'again', 'age', 'agent', 'agree', 'ahead', 'aim', 'air', 'airport',
      'aisle', 'alarm', 'album', 'alcohol', 'alert', 'alien', 'all', 'alley'
    ];
    return Array(12).fill(0).map(() => words[Math.floor(Math.random() * words.length)]).join(' ');
  }
  
  // Generate mock Solana address (use real derivation in production)
  function generateSolanaAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }
  
  // Navigation
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      state.currentScreen = screenId;
    }
  }
  
  // Copy to clipboard with visual feedback
  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      btn.style.background = '#10b981';
      
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.background = '';
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Failed to copy to clipboard');
    }
  }
  
  // Load wallet data from storage
  function loadWalletData() {
    chrome.storage.local.get(['walletAddress', 'balance', 'publicKey'], (result) => {
      if (result.walletAddress) {
        state.walletAddress = result.walletAddress;
        state.balance = result.balance || 0;
        state.publicKey = result.publicKey || result.walletAddress;
  
        // Update UI
        const shortAddress = state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
        const addressEl = document.getElementById('walletAddress');
        if (addressEl) {
          addressEl.textContent = shortAddress;
        }
  
        const balanceEl = document.getElementById('balanceAmount');
        if (balanceEl) {
          balanceEl.textContent = state.balance.toFixed(2);
        }
  
        const balanceUsdEl = document.getElementById('balanceUsd');
        if (balanceUsdEl) {
          balanceUsdEl.textContent = '≈ $' + (state.balance * 150).toFixed(2) + ' USD';
        }
  
        // Fetch real balance from blockchain
        fetchBalance(state.walletAddress);
      }
    });
  }
  
  // Fetch balance from Solana blockchain
  async function fetchBalance(address) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_BALANCE',
        address: address
      });
  
      if (response && response.success) {
        state.balance = response.balance;
        
        // Update UI
        const balanceEl = document.getElementById('balanceAmount');
        if (balanceEl) {
          balanceEl.textContent = state.balance.toFixed(2);
        }
  
        const balanceUsdEl = document.getElementById('balanceUsd');
        if (balanceUsdEl) {
          balanceUsdEl.textContent = '≈ $' + (state.balance * 150).toFixed(2) + ' USD';
        }
  
        // Update available balance in send screen
        const availableEl = document.getElementById('availableBalance');
        if (availableEl) {
          availableEl.textContent = state.balance.toFixed(2);
        }
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }
  
  // Display seed phrase in grid
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
  
  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup loaded');
  
    // Check if wallet already exists
    chrome.storage.local.get(['hasWallet', 'walletAddress'], (result) => {
      if (result.hasWallet && result.walletAddress) {
        loadWalletData();
        showScreen('mainScreen');
      } else {
        showScreen('welcomeScreen');
      }
    });
  
    // ========================================
    // WELCOME SCREEN
    // ========================================
    const createWalletBtn = document.getElementById('createWalletBtn');
    if (createWalletBtn) {
      createWalletBtn.addEventListener('click', () => {
        showScreen('createPasswordScreen');
      });
    }
  
    const importWalletBtn = document.getElementById('importWalletBtn');
    if (importWalletBtn) {
      importWalletBtn.addEventListener('click', () => {
        alert('Import functionality coming soon!\n\nFor now, please create a new wallet.');
      });
    }
  
    // ========================================
    // CREATE PASSWORD SCREEN
    // ========================================
    const backToWelcome = document.getElementById('backToWelcome');
    if (backToWelcome) {
      backToWelcome.addEventListener('click', () => {
        showScreen('welcomeScreen');
        // Clear password fields
        document.getElementById('password').value = '';
        document.getElementById('confirmPassword').value = '';
      });
    }
  
    const createPasswordForm = document.getElementById('createPasswordForm');
    if (createPasswordForm) {
      createPasswordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
  
        // Validation
        if (password !== confirmPassword) {
          alert('Passwords do not match!');
          return;
        }
  
        if (password.length < 8) {
          alert('Password must be at least 8 characters long!');
          return;
        }
  
        // Store password (in production: hash this!)
        state.password = password;
        
        // Generate seed phrase
        state.seedPhrase = generateSeedPhrase();
        
        // Display seed phrase and move to next screen
        displaySeedPhrase();
        showScreen('seedBackupScreen');
      });
    }
  
    // ========================================
    // SEED BACKUP SCREEN
    // ========================================
    const revealSeedBtn = document.getElementById('revealSeedBtn');
    if (revealSeedBtn) {
      revealSeedBtn.addEventListener('click', function() {
        const seedGrid = document.getElementById('seedGrid');
        if (seedGrid) {
          seedGrid.classList.add('revealed');
        }
        this.classList.add('hidden');
        
        const copySeedBtn = document.getElementById('copySeedBtn');
        if (copySeedBtn) {
          copySeedBtn.style.display = 'block';
        }
        
        const confirmSeedBtn = document.getElementById('confirmSeedBtn');
        if (confirmSeedBtn) {
          confirmSeedBtn.disabled = false;
        }
      });
    }
  
    const copySeedBtn = document.getElementById('copySeedBtn');
    if (copySeedBtn) {
      copySeedBtn.addEventListener('click', function() {
        copyToClipboard(state.seedPhrase, this);
      });
    }
  
    const confirmSeedBtn = document.getElementById('confirmSeedBtn');
    if (confirmSeedBtn) {
      confirmSeedBtn.addEventListener('click', () => {
        // Generate wallet address (in production: derive from seed phrase using bip39)
        state.walletAddress = generateSolanaAddress();
        state.publicKey = state.walletAddress;
        state.balance = 0; // Start with 0 balance
  
        // Save to storage (in production: encrypt private key!)
        chrome.storage.local.set({
          hasWallet: true,
          walletAddress: state.walletAddress,
          publicKey: state.publicKey,
          balance: state.balance,
          // WARNING: Never store seed phrase in production!
          // This is just for demo purposes
          encryptedSeed: state.seedPhrase // In production: encrypt this!
        }, () => {
          console.log('Wallet created and saved');
          loadWalletData();
          showScreen('mainScreen');
        });
      });
    }
  
    // ========================================
    // MAIN WALLET SCREEN
    // ========================================
    const copyAddressBtn = document.getElementById('copyAddressBtn');
    if (copyAddressBtn) {
      copyAddressBtn.addEventListener('click', function() {
        copyToClipboard(state.walletAddress, this);
      });
    }
  
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const availableBalance = document.getElementById('availableBalance');
        if (availableBalance) {
          availableBalance.textContent = state.balance.toFixed(2);
        }
        showScreen('sendScreen');
      });
    }
  
    const receiveBtn = document.getElementById('receiveBtn');
    if (receiveBtn) {
      receiveBtn.addEventListener('click', () => {
        const receiveAddress = document.getElementById('receiveAddress');
        if (receiveAddress) {
          receiveAddress.textContent = state.walletAddress;
        }
        showScreen('receiveScreen');
      });
    }
  
    const swapBtn = document.getElementById('swapBtn');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        alert('Swap functionality coming soon!\n\nThis will allow you to swap tokens using Jupiter or other DEX aggregators.');
      });
    }
  
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        alert('Settings coming soon!\n\nFeatures:\n- Change password\n- Export private key\n- Network settings\n- Clear wallet data');
      });
    }
  
    // ========================================
    // SEND SCREEN
    // ========================================
    const backFromSend = document.getElementById('backFromSend');
    if (backFromSend) {
      backFromSend.addEventListener('click', () => {
        showScreen('mainScreen');
        // Clear form
        document.getElementById('recipientAddress').value = '';
        document.getElementById('sendAmount').value = '';
      });
    }
  
    const sendAmountInput = document.getElementById('sendAmount');
    if (sendAmountInput) {
      sendAmountInput.addEventListener('input', (e) => {
        const amount = parseFloat(e.target.value) || 0;
        const fee = 0.000005;
        const total = amount + fee;
        
        const totalAmountEl = document.getElementById('totalAmount');
        if (totalAmountEl) {
          totalAmountEl.textContent = total.toFixed(6) + ' SOL';
        }
      });
    }
  
    const sendForm = document.getElementById('sendForm');
    if (sendForm) {
      sendForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const recipient = document.getElementById('recipientAddress').value;
        const amount = parseFloat(document.getElementById('sendAmount').value);
  
        // Validation
        if (!recipient || recipient.length < 32) {
          alert('Please enter a valid Solana address!');
          return;
        }
  
        if (amount <= 0) {
          alert('Please enter a valid amount!');
          return;
        }
  
        if (amount > state.balance) {
          alert('Insufficient balance!\n\nAvailable: ' + state.balance.toFixed(2) + ' SOL');
          return;
        }
  
        // In production: 
        // 1. Create transaction
        // 2. Sign with private key
        // 3. Send to blockchain
        // 4. Wait for confirmation
        
        const confirmed = confirm(
          `Send ${amount} SOL to:\n${recipient.slice(0, 8)}...${recipient.slice(-8)}?\n\nNetwork fee: 0.000005 SOL\nTotal: ${(amount + 0.000005).toFixed(6)} SOL`
        );
  
        if (confirmed) {
          // Mock transaction
          alert('🚀 Transaction sent!\n\nThis is a demo. In production, this would:\n1. Sign the transaction\n2. Send to Solana network\n3. Wait for confirmation');
          
          // Update balance (mock)
          state.balance -= (amount + 0.000005);
          chrome.storage.local.set({ balance: state.balance });
          
          // Clear form and go back
          document.getElementById('recipientAddress').value = '';
          document.getElementById('sendAmount').value = '';
          
          loadWalletData();
          showScreen('mainScreen');
        }
      });
    }
  
    // ========================================
    // RECEIVE SCREEN
    // ========================================
    const backFromReceive = document.getElementById('backFromReceive');
    if (backFromReceive) {
      backFromReceive.addEventListener('click', () => {
        showScreen('mainScreen');
      });
    }
  
    const copyReceiveAddressBtn = document.getElementById('copyReceiveAddressBtn');
    if (copyReceiveAddressBtn) {
      copyReceiveAddressBtn.addEventListener('click', function() {
        copyToClipboard(state.walletAddress, this);
      });
    }
  
    // ========================================
    // AUTO-REFRESH BALANCE
    // ========================================
    // Refresh balance every 30 seconds when on main screen
    setInterval(() => {
      if (state.currentScreen === 'mainScreen' && state.walletAddress) {
        fetchBalance(state.walletAddress);
      }
    }, 30000);
  });
  
  // Handle extension icon click
  chrome.action.onClicked?.addListener(() => {
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 375,
      height: 600
    });
  });