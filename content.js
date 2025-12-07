// Ring Auto-Reconnect Extension
// Automatically clicks reconnect button when live view disconnects

/**
 * IMMEDIATELY INVOKED FUNCTION EXPRESSION (IIFE)
 * ----------------------------------------------
 * We wrap the entire code in a function `(function() { ... })();`.
 * This creates a private "scope" for our variables so they don't clash with
 * other scripts running on the Ring website. It's like putting our code in a
 * sandbox so it plays nicely with others.
 */
(function() {
  /**
   * STRICT MODE
   * -----------
   * 'use strict' tells the browser to run this code in a stricter mode.
   * It catches common coding mistakes (like using undeclared variables) and
   * throws errors instead of ignoring them. It makes the code safer.
   */
  'use strict';
  
  // Log a message to the browser's developer console so we know the extension started.
  console.log('Ring Auto-Reconnect extension loaded');
  
  /**
   * CONFIGURATION
   * -------------
   * A central place to store "magic numbers" and settings.
   * If we need to change how fast it checks or what buttons it looks for,
   * we just change it here instead of hunting through the code.
   */
  const CONFIG = {
    checkInterval: 1000, // How often to run the fallback check (in milliseconds). 1000ms = 1 second.
    reconnectDelay: 500, // A small pause before clicking, to make it feel more "human" and let the UI settle.
    refreshInterval: 300000, // 5 minutes in milliseconds. We refresh the whole page occasionally to prevent memory leaks or frozen video streams.

    // A list of "selectors" used to find the button in the HTML.
    // Think of these as search queries for specific elements on the page.
    buttonSelectors: [
      'button[data-testid="reconnect-button"]', // A specific ID used by developers for testing
      'button:contains("Reconnect")',            // A custom pseudo-selector we'll handle manually (looking for text)
      'button:contains("Continue Watching")',     // Another text variation
      '[class*="reconnect"]',                     // Any element with "reconnect" in its class name
      '[aria-label*="reconnect" i]',              // "aria-label" is for screen readers; "i" means case-insensitive
      '[aria-label*="Continue" i]'                // Checking for "Continue" in the accessibility label
    ],

    // Words we look for to confirm a button is actually related to a disconnection.
    disconnectIndicators: [
      'disconnected',
      'connection lost',
      'reconnect',
      'continue watching',
      'tap to reconnect'
    ],

    // Selectors for the login page elements.
    loginSelectors: {
        password: 'input[type="password"]',
        submit: [
            'button[data-testid="submit-button"]',
            'button[type="submit"]',
            'button:contains("Sign in")',
            'button:contains("Log in")'
        ]
    }
  };
  
  // GLOBAL VARIABLES
  // ----------------

  // Stores the timestamp (time in ms) of the last time we clicked the button.
  // We use this to prevent clicking too rapidly (spamming the button).
  let lastClickTime = 0;

  // Stores the timestamp of the last login attempt to prevent spamming the sign-in button.
  let lastLoginTime = 0;

  // The observer monitors the webpage for changes (like a popup appearing).
  let observer = null;
  
  /**
   * FUNCTION: isDisconnectText
   * --------------------------
   * Checks if a piece of text (like a button label) contains words that indicate
   * the camera has disconnected.
   *
   * @param {string} text - The text to check.
   * @returns {boolean} - True if it sounds like a disconnect message, False otherwise.
   */
  function isDisconnectText(text) {
    if (!text) return false; // If text is empty/null, it's not a match.

    // Convert to lowercase so "Reconnect" matches "reconnect" (case-insensitive).
    const lowerText = text.toLowerCase();

    // Check if ANY of our indicator words are inside the text.
    // .some() runs the function for each item in the list until one returns true.
    return CONFIG.disconnectIndicators.some(indicator => 
      lowerText.includes(indicator)
    );
  }
  
  /**
   * FUNCTION: findReconnectButton
   * -----------------------------
   * The detective of our script. It scans the page looking for the "Reconnect" button.
   * It tries multiple methods (selectors) defined in CONFIG.
   *
   * @returns {Element|null} - The HTML element of the button if found, or null if not found.
   */
  function findReconnectButton() {
    // Loop through each strategy in our list of selectors
    for (const selector of CONFIG.buttonSelectors) {

      // SPECIAL CASE: Handling ':contains("Text")'
      // CSS doesn't support ':contains' natively, so we implement logic for it.
      if (selector.includes(':contains')) {
        // Extract the text we are looking for (e.g., "Reconnect") using Regex
        const match = selector.match(/button:contains\("(.+?)"\)/);
        if (match) {
          const searchText = match[1]; // The text inside the quotes
          const buttons = document.querySelectorAll('button'); // Get ALL buttons on the page

          // Check each button to see if it has the text we want
          for (const button of buttons) {
            // .trim() removes spaces around text.
            if (button.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
              return button; // Found it!
            }
          }
        }
      } else {
        // STANDARD CASE: Use normal CSS selectors
        const element = document.querySelector(selector);
        // If we found an element AND it is actually visible to the user
        if (element && isElementVisible(element)) {
          return element;
        }
      }
    }
    
    // FALLBACK STRATEGY
    // If specific selectors failed, look at ALL buttons and check their text against our dictionary.
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const button of allButtons) {
      // Get the button's text OR its accessibility label
      const text = button.textContent || button.getAttribute('aria-label') || '';

      // If the text sounds like a disconnect message AND the button is visible
      if (isDisconnectText(text) && isElementVisible(button)) {
        return button;
      }
    }
    
    return null; // No button found
  }
  
  /**
   * FUNCTION: isElementVisible
   * --------------------------
   * Checks if an HTML element is actually visible on the screen.
   * Sometimes websites hide buttons instead of removing them. We shouldn't click hidden buttons.
   *
   * @param {Element} element - The HTML element to check.
   * @returns {boolean} - True if visible, False if hidden.
   */
  function isElementVisible(element) {
    if (!element) return false;

    // Ask the browser for the computed styles (the final CSS rules applied)
    const style = window.getComputedStyle(element);

    return style.display !== 'none' &&       // It's not set to display: none
           style.visibility !== 'hidden' &&  // It's not set to visibility: hidden
           style.opacity !== '0' &&          // It's not fully transparent
           element.offsetParent !== null;    // It occupies space in the layout
  }
  
  /**
   * FUNCTION: handleLogin
   * ---------------------
   * Detects if we are on a login page and attempts to sign in automatically.
   * It checks if a password field exists and has a value (autofilled by the browser).
   */
  function handleLogin() {
    const now = Date.now();
    // Prevent spamming the login button (wait 5 seconds between attempts)
    if (now - lastLoginTime < 5000) {
      return;
    }

    const passwordField = document.querySelector(CONFIG.loginSelectors.password);

    // If there is no password field, we aren't on the login page (or it's not loaded yet).
    if (!passwordField) {
        return;
    }

    // Check if the password field has content (autofilled).
    // .value gives us the text inside the input box.
    if (passwordField.value && passwordField.value.length > 0) {
        console.log('Ring Auto-Reconnect: Detected filled password field. Attempting login...');

        // Find the submit button
        let submitButton = null;
        for (const selector of CONFIG.loginSelectors.submit) {
            if (selector.includes(':contains')) {
                const match = selector.match(/button:contains\("(.+?)"\)/);
                if (match) {
                    const searchText = match[1];
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        if (button.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
                            submitButton = button;
                            break;
                        }
                    }
                }
            } else {
                const el = document.querySelector(selector);
                if (el && isElementVisible(el)) {
                    submitButton = el;
                    break;
                }
            }
            if (submitButton) break;
        }

        if (submitButton) {
            lastLoginTime = now;
            console.log('Ring Auto-Reconnect: Found submit button, clicking...');
            setTimeout(() => {
                try {
                    submitButton.click();
                    console.log('Ring Auto-Reconnect: Clicked sign in button');
                } catch (error) {
                    console.error('Ring Auto-Reconnect: Error clicking sign in button', error);
                }
            }, CONFIG.reconnectDelay);
        } else {
            console.log('Ring Auto-Reconnect: Password filled but no submit button found.');
        }
    }
  }

  /**
   * FUNCTION: clickReconnect
   * ------------------------
   * The action hero. Tries to find the button and clicks it.
   * Includes safeguards to prevent rapid-fire clicking.
   */
  function clickReconnect() {
    const now = Date.now(); // Get current time in ms
    
    // DEBOUNCING / COOL-DOWN
    // If we clicked less than 3 seconds (3000ms) ago, stop. Don't spam.
    if (now - lastClickTime < 3000) {
      return;
    }
    
    const button = findReconnectButton();
    
    if (button) {
      console.log('Ring Auto-Reconnect: Found reconnect button, clicking...');
      lastClickTime = now; // Update the last click time
      
      // Wait a tiny bit (reconnectDelay) before actually clicking.
      // This mimics human reaction time slightly and ensures the UI is ready.
      setTimeout(() => {
        try {
          button.click(); // Perform the click!
          console.log('Ring Auto-Reconnect: Clicked reconnect button');
        } catch (error) {
          console.error('Ring Auto-Reconnect: Error clicking button', error);
        }
      }, CONFIG.reconnectDelay);
    }
  }
  
  /**
   * FUNCTION: setupObserver
   * -----------------------
   * Sets up a "MutationObserver". This is a powerful browser feature that
   * watches the HTML code of the page for changes.
   * Instead of constantly asking "is the button there?", the browser tells US
   * "hey, something changed on the page!"
   */
  function setupObserver() {
    // If an observer already exists, turn it off first to avoid duplicates.
    if (observer) {
      observer.disconnect();
    }
    
    // Create the observer. The function inside runs whenever a change happens.
    observer = new MutationObserver((mutations) => {
      // Loop through the changes (mutations)
      for (const mutation of mutations) {
        // If elements were added/removed (childList) or text changed (characterData)
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Check if the reconnect button appeared
          clickReconnect();
          // Also check if we need to log in
          handleLogin();
          break; // Stop checking this batch of changes, we already triggered a check.
        }
      }
    });
    
    // Start watching the body of the document.
    observer.observe(document.body, {
      childList: true,      // Watch for added/removed elements
      subtree: true,        // Watch EVERY element inside the body, not just direct children
      characterData: true   // Watch for text changes
    });
  }
  
  /**
   * FUNCTION: periodicCheck
   * -----------------------
   * A backup plan. Even with the observer, sometimes things get missed.
   * This runs on a timer just to be safe.
   */
  function periodicCheck() {
    clickReconnect();
    handleLogin();
  }
  
  /**
   * FUNCTION: init
   * --------------
   * The starting point. Sets everything up when the script loads.
   */
  function init() {
    console.log('Ring Auto-Reconnect: Initializing...');
    
    // If the page is still loading, wait until it's ready (DOMContentLoaded)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    // 1. Start the MutationObserver (reactive checking)
    setupObserver();

    // 2. Start the interval timer (proactive checking every 1 second)
    setInterval(periodicCheck, CONFIG.checkInterval);
    
    // 3. Set up the long-term page refresh (every 5 minutes)
    // This is the "Nuclear Option" to fix frozen streams by reloading the whole page.
    setInterval(() => {
      console.log('Ring Auto-Reconnect: 5 minutes passed, refreshing page...');
      window.location.reload();
    }, CONFIG.refreshInterval);

    console.log('Ring Auto-Reconnect: Ready and monitoring');
  }
  
  // Kick off the script!
  init();
})();
