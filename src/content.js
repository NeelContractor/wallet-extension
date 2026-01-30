console.log('Solana Wallet - Content Script Loaded');

// Inject the provider script into the page
function injectProvider() {
  try {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        console.log('Solana Wallet Provider Injected');
        
        // Create Solana provider object
        class SolanaProvider extends EventTarget {
          constructor() {
            super();
            this.isConnected = false;
            this.publicKey = null;
            this.autoApprove = false;
            this._handleMessage = this._handleMessage.bind(this);
            window.addEventListener('message', this._handleMessage);
          }

          async connect() {
            console.log('Solana: connect() called');
            return new Promise((resolve, reject) => {
              const requestId = 'connect_' + Date.now();
              
              window.addEventListener('message', function handler(event) {
                if (event.data.type === 'SOLANA_RESPONSE' && event.data.requestId === requestId) {
                  window.removeEventListener('message', handler);
                  
                  if (event.data.success) {
                    this.isConnected = true;
                    this.publicKey = { toBase58: () => event.data.publicKey };
                    this.dispatchEvent(new Event('connect'));
                    resolve({ publicKey: this.publicKey });
                  } else {
                    reject(new Error(event.data.error || 'Connection failed'));
                  }
                }
              }.bind(this));

              window.postMessage({
                type: 'SOLANA_REQUEST',
                method: 'connect',
                requestId: requestId
              }, '*');
            });
          }

          async disconnect() {
            console.log('Solana: disconnect() called');
            return new Promise((resolve) => {
              const requestId = 'disconnect_' + Date.now();
              
              window.addEventListener('message', function handler(event) {
                if (event.data.type === 'SOLANA_RESPONSE' && event.data.requestId === requestId) {
                  window.removeEventListener('message', handler);
                  this.isConnected = false;
                  this.publicKey = null;
                  this.dispatchEvent(new Event('disconnect'));
                  resolve();
                }
              }.bind(this));

              window.postMessage({
                type: 'SOLANA_REQUEST',
                method: 'disconnect',
                requestId: requestId
              }, '*');
            });
          }

          async signAndSendTransaction(transaction) {
            console.log('Solana: signAndSendTransaction() called');
            return new Promise((resolve, reject) => {
              const requestId = 'signSend_' + Date.now();
              
              window.addEventListener('message', function handler(event) {
                if (event.data.type === 'SOLANA_RESPONSE' && event.data.requestId === requestId) {
                  window.removeEventListener('message', handler);
                  
                  if (event.data.success) {
                    resolve({ signature: event.data.signature });
                  } else {
                    reject(new Error(event.data.error || 'Transaction failed'));
                  }
                }
              });

              window.postMessage({
                type: 'SOLANA_REQUEST',
                method: 'signAndSendTransaction',
                transaction: transaction,
                requestId: requestId
              }, '*');
            });
          }

          async signTransaction(transaction) {
            console.log('Solana: signTransaction() called');
            return new Promise((resolve, reject) => {
              const requestId = 'sign_' + Date.now();
              
              window.addEventListener('message', function handler(event) {
                if (event.data.type === 'SOLANA_RESPONSE' && event.data.requestId === requestId) {
                  window.removeEventListener('message', handler);
                  
                  if (event.data.success) {
                    resolve(event.data.signedTransaction);
                  } else {
                    reject(new Error(event.data.error || 'Signing failed'));
                  }
                }
              });

              window.postMessage({
                type: 'SOLANA_REQUEST',
                method: 'signTransaction',
                transaction: transaction,
                requestId: requestId
              }, '*');
            });
          }

          async signAllTransactions(transactions) {
            console.log('Solana: signAllTransactions() called');
            const signed = [];
            for (const tx of transactions) {
              signed.push(await this.signTransaction(tx));
            }
            return signed;
          }

          _handleMessage(event) {
            if (event.data.type === 'SOLANA_EVENT') {
              this.dispatchEvent(new CustomEvent(event.data.event, { 
                detail: event.data.data 
              }));
            }
          }
        }

        // Create and expose the provider
        const provider = new SolanaProvider();
        
        // Expose as 'solana' (Phantom-compatible)
        window.solana = provider;
        
        // Also expose as custom name
        window.solanawallet = provider;
        
        // Announce availability
        window.dispatchEvent(new Event('solana#initialized'));
        
        console.log('Solana provider available at window.solana');
      })();
    `;
    
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    
    console.log('Provider script injected successfully');
  } catch (error) {
    console.error('Failed to inject provider:', error);
  }
}

// Inject as early as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectProvider);
} else {
  injectProvider();
}

// Listen for messages from the injected provider
window.addEventListener('message', async (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  if (event.data.type === 'SOLANA_REQUEST') {
    console.log('Content script received:', event.data.method);
    
    try {
      let response;
      
      switch (event.data.method) {
        case 'connect':
          response = await chrome.runtime.sendMessage({ 
            type: 'CONNECT_WALLET' 
          });
          
          window.postMessage({
            type: 'SOLANA_RESPONSE',
            requestId: event.data.requestId,
            success: response.success,
            publicKey: response.publicKey,
            error: response.error
          }, '*');
          break;

        case 'disconnect':
          response = await chrome.runtime.sendMessage({ 
            type: 'DISCONNECT_WALLET' 
          });
          
          window.postMessage({
            type: 'SOLANA_RESPONSE',
            requestId: event.data.requestId,
            success: true
          }, '*');
          break;

        case 'signTransaction':
          response = await chrome.runtime.sendMessage({ 
            type: 'SIGN_TRANSACTION',
            transaction: event.data.transaction 
          });
          
          window.postMessage({
            type: 'SOLANA_RESPONSE',
            requestId: event.data.requestId,
            success: response.success,
            signedTransaction: response.signedTransaction,
            error: response.error
          }, '*');
          break;

        case 'signAndSendTransaction':
          // First sign
          const signResponse = await chrome.runtime.sendMessage({ 
            type: 'SIGN_TRANSACTION',
            transaction: event.data.transaction 
          });
          
          if (!signResponse.success) {
            window.postMessage({
              type: 'SOLANA_RESPONSE',
              requestId: event.data.requestId,
              success: false,
              error: signResponse.error
            }, '*');
            break;
          }
          
          // Then send
          const sendResponse = await chrome.runtime.sendMessage({ 
            type: 'SEND_TRANSACTION',
            transaction: signResponse.signedTransaction 
          });
          
          window.postMessage({
            type: 'SOLANA_RESPONSE',
            requestId: event.data.requestId,
            success: sendResponse.success,
            signature: sendResponse.signature,
            error: sendResponse.error
          }, '*');
          break;

        default:
          window.postMessage({
            type: 'SOLANA_RESPONSE',
            requestId: event.data.requestId,
            success: false,
            error: 'Unknown method'
          }, '*');
      }
    } catch (error) {
      console.error('Content script error:', error);
      window.postMessage({
        type: 'SOLANA_RESPONSE',
        requestId: event.data.requestId,
        success: false,
        error: error.message
      }, '*');
    }
  }
});

// Notify background when tab is closed
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ type: 'TAB_CLOSING' });
});