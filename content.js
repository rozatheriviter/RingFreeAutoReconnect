// Ring Auto-Reconnect Extension
// Automatically clicks reconnect button when live view disconnects

(function() {
  'use strict';
  
  console.log('Ring Auto-Reconnect extension loaded');
  
  // Configuration
  const CONFIG = {
    checkInterval: 1000, // Check every second
    reconnectDelay: 500, // Wait 500ms before clicking reconnect
    buttonSelectors: [
      'button[data-testid="reconnect-button"]',
      'button:contains("Reconnect")',
      'button:contains("Continue Watching")',
      '[class*="reconnect"]',
      '[aria-label*="reconnect" i]',
      '[aria-label*="Continue" i]'
    ],
    disconnectIndicators: [
      'disconnected',
      'connection lost',
      'reconnect',
      'continue watching',
      'tap to reconnect'
    ]
  };
  
  let lastClickTime = 0;
  let observer = null;
  
  function isDisconnectText(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return CONFIG.disconnectIndicators.some(indicator => 
      lowerText.includes(indicator)
    );
  }
  
  function findReconnectButton() {
    for (const selector of CONFIG.buttonSelectors) {
      if (selector.includes(':contains')) {
        const match = selector.match(/button:contains\("(.+?)"\)/);
        if (match) {
          const searchText = match[1];
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            if (button.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
              return button;
            }
          }
        }
      } else {
        const element = document.querySelector(selector);
        if (element && isElementVisible(element)) {
          return element;
        }
      }
    }
    
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const button of allButtons) {
      const text = button.textContent || button.getAttribute('aria-label') || '';
      if (isDisconnectText(text) && isElementVisible(button)) {
        return button;
      }
    }
    
    return null;
  }
  
  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }
  
  function clickReconnect() {
    const now = Date.now();
    
    if (now - lastClickTime < 3000) {
      return;
    }
    
    const button = findReconnectButton();
    
    if (button) {
      console.log('Ring Auto-Reconnect: Found reconnect button, clicking...');
      lastClickTime = now;
      
      setTimeout(() => {
        try {
          button.click();
          console.log('Ring Auto-Reconnect: Clicked reconnect button');
        } catch (error) {
          console.error('Ring Auto-Reconnect: Error clicking button', error);
        }
      }, CONFIG.reconnectDelay);
    }
  }
  
  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }
    
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          clickReconnect();
          break;
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  function periodicCheck() {
    clickReconnect();
  }
  
  function init() {
    console.log('Ring Auto-Reconnect: Initializing...');
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    setupObserver();
    setInterval(periodicCheck, CONFIG.checkInterval);
    
    console.log('Ring Auto-Reconnect: Ready and monitoring');
  }
  
  init();
})();