// Dialogue Page JavaScript
class DialoguePage {
    constructor() {
        this.originalDialogue = '';
        this.modifiedDialogue = [];
        this.learnerNames = [];
        this.currentConversationIndex = 0;
        this.currentLineIndex = -1;
        this.isLoading = false;
        this.currentLanguage = 'English';

        // Auto-advance (dialog-to-dialog) settings
        this.autoAdvanceEnabled = true;
        this.autoAdvanceInitialDelayMs = 4000; // first line in a new conversation
        this.autoAdvanceDelayMs = 3000; // subsequent lines
        this.autoAdvanceTimeoutId = null;

        // Keep initial-vs-normal gap consistent when changing speed via slider
        this.autoAdvanceInitialOffsetMs = Math.max(0, this.autoAdvanceInitialDelayMs - this.autoAdvanceDelayMs);
        
        // Time tracking for session
        this.sessionStartTime = null;
        this.sessionEndTime = null;
        this.sessionDurationMinutes = null;
        this.sessionTimerInterval = null;
        this.sessionWarningShown = false;
        this.sessionPausedTime = null;
        this.totalPausedDuration = 0;
        
        // Character-based timing: 10 characters per second
        this.useCharacterBasedTiming = true;
        this.baseDelayMs = 0;
        this.msPerCharacter = 100; // 1000ms / 10 = 100ms per character → 10 chars per second
        this.minDelayMs = 1500; // Minimum 1.5 seconds for very short lines
        this.maxDelayMs = 15000; // Maximum 15 seconds for long lines
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Clean up any leftover modals from previous sessions
        this.cleanupModals();
        console.log('Dialogue Page initialized');
    }

    cleanupModals() {
        // Remove any existing modals on initialization
        const modals = document.querySelectorAll('.session-duration-modal, .time-expired-modal, .time-warning-toast');
        modals.forEach(m => m.remove());
    }

    setupEventListeners() {
        // Conversation selector
        const conversationSelector = document.getElementById('conversation-selector');
        if (conversationSelector) {
            conversationSelector.addEventListener('change', (e) => {
                this.setCurrentConversation(parseInt(e.target.value));
            });
        }

        // Navigation buttons
        const prevConversationBtn = document.getElementById('prev-conversation-btn');
        const nextConversationBtn = document.getElementById('next-conversation-btn');
        const prevLineBtn = document.getElementById('prev-line-btn');
        const nextLineBtn = document.getElementById('next-line-btn');
        const toggleAutoAdvanceBtn = document.getElementById('toggle-auto-advance-btn');
        const speedSlider = document.getElementById('speed-slider');

        if (prevConversationBtn) {
            prevConversationBtn.addEventListener('click', () => this.previousConversation());
        }

        if (nextConversationBtn) {
            nextConversationBtn.addEventListener('click', () => this.nextConversation());
        }

        if (prevLineBtn) {
            prevLineBtn.addEventListener('click', () => this.previousLine());
        }

        if (nextLineBtn) {
            nextLineBtn.addEventListener('click', () => this.nextLine());
        }

        if (toggleAutoAdvanceBtn) {
            toggleAutoAdvanceBtn.addEventListener('click', () => this.toggleAutoAdvance());
            this._syncAutoAdvanceButton();
        }

        if (speedSlider) {
            this._initSpeedSlider(speedSlider);
            speedSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                this.setAutoAdvanceSpeed(value);
            });
        }
    }

    _initSpeedSlider(speedSlider) {
        // Ensure default knob starts in the middle based on current code value
        const min = 1000;
        const max = Math.max(min + 1000, (this.autoAdvanceDelayMs * 2) - min);
        speedSlider.min = String(min);
        speedSlider.max = String(max);
        speedSlider.step = '250';
        speedSlider.value = String(this.autoAdvanceDelayMs);
        this._updateSpeedValueUI(this.autoAdvanceDelayMs);
    }

    _updateSpeedValueUI(delayMs) {
        const el = document.getElementById('speed-value');
        if (!el) return;
        el.textContent = `${(delayMs / 1000).toFixed(1)}s`;
    }

    // Calculate delay based on character count
    calculateDelayFromText(text) {
        if (!this.useCharacterBasedTiming) {
            return this.autoAdvanceDelayMs;
        }

        // Extract text content from HTML if present
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const plainText = tempDiv.textContent || tempDiv.innerText || text;
        
        // Count characters (excluding whitespace)
        const charCount = plainText.replace(/\s/g, '').length;
        
        // Calculate delay: base + (characters × ms per char)
        const calculatedDelay = this.baseDelayMs + (charCount * this.msPerCharacter);
        
        // Clamp between min and max
        return Math.max(this.minDelayMs, Math.min(this.maxDelayMs, calculatedDelay));
    }

    // Session time management
    startSessionTimer(durationMinutes) {
        console.log('⏱️ Starting session timer for', durationMinutes, 'minutes');
        
        this.sessionStartTime = new Date();
        this.sessionDurationMinutes = durationMinutes;
        this.totalPausedDuration = 0;
        this.sessionPausedTime = null;
        
        if (durationMinutes && durationMinutes > 0) {
            this.sessionEndTime = new Date(this.sessionStartTime.getTime() + (durationMinutes * 60 * 1000));
            this.sessionWarningShown = false;
            
            console.log('Session will end at:', this.sessionEndTime.toLocaleTimeString());
            
            // Update timer display every second
            this.sessionTimerInterval = setInterval(() => {
                this.updateSessionTimerDisplay();
                this.checkSessionTimeRemaining();
            }, 1000);
            
            this.updateSessionTimerDisplay();
            this.showSessionTimerUI();
        } else {
            console.log('No time limit - timer not started');
        }
    }

    updateSessionTimerDisplay() {
        const timerDisplay = document.getElementById('session-timer-display');
        if (!timerDisplay || !this.sessionEndTime) return;
        
        const now = new Date();
        const timeRemaining = this.sessionEndTime - now;
        
        if (timeRemaining <= 0) {
            timerDisplay.textContent = 'Time: 00:00';
            timerDisplay.classList.add('time-expired');
            return;
        }
        
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        timerDisplay.textContent = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        // Add warning color when less than 1 minute
        if (timeRemaining < 60000) {
            timerDisplay.classList.add('time-warning');
        }
    }

    checkSessionTimeRemaining() {
        if (!this.sessionEndTime) return;
        
        const now = new Date();
        const timeRemaining = this.sessionEndTime - now;
        
        // Show warning at 1 minute remaining
        if (timeRemaining <= 60000 && timeRemaining > 0 && !this.sessionWarningShown) {
            this.sessionWarningShown = true;
            this.showTimeWarning('1 minute remaining!');
        }
        
        // Time expired - stop conversation
        if (timeRemaining <= 0) {
            this.stopSessionTimer();
            this.stopAutoAdvance();
            this.showTimeExpiredDialog();
        }
    }

    showTimeWarning(message) {
        const warning = document.createElement('div');
        warning.className = 'time-warning-toast';
        warning.textContent = message;
        document.body.appendChild(warning);
        
        setTimeout(() => {
            warning.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            warning.classList.remove('show');
            setTimeout(() => warning.remove(), 300);
        }, 3000);
    }

    showTimeExpiredDialog() {
        const modal = document.createElement('div');
        modal.className = 'time-expired-modal';
        modal.innerHTML = `
            <div class="time-expired-content">
                <h3>⏰ Time's Up!</h3>
                <p>Your learning session has ended.</p>
                <div class="time-expired-actions">
                    <button id="continue-learning-btn" class="btn btn-primary">Continue Learning</button>
                    <button id="go-home-btn" class="btn btn-secondary">Go to Home</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        setTimeout(() => modal.classList.add('show'), 10);
        
        document.getElementById('continue-learning-btn').addEventListener('click', () => {
            modal.remove();
            // Extend time by 5 minutes
            this.startSessionTimer(5);
            if (this.autoAdvanceEnabled) {
                this.resumeAutoAdvance();
            }
        });
        
        document.getElementById('go-home-btn').addEventListener('click', () => {
            modal.remove();
            if (window.app) {
                window.app.showPage('home');
            }
        });
    }

    pauseSessionTimer() {
        if (this.sessionTimerInterval && !this.sessionPausedTime) {
            this.sessionPausedTime = new Date();
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
            
            // Update UI to show paused state
            const timerDisplay = document.getElementById('session-timer-display');
            if (timerDisplay) {
                timerDisplay.classList.add('timer-paused');
            }
        }
    }

    resumeSessionTimer() {
        if (this.sessionPausedTime && this.sessionEndTime) {
            // Calculate how long we were paused
            const pauseDuration = new Date() - this.sessionPausedTime;
            this.totalPausedDuration += pauseDuration;
            
            // Extend the end time by the pause duration
            this.sessionEndTime = new Date(this.sessionEndTime.getTime() + pauseDuration);
            
            this.sessionPausedTime = null;
            
            // Restart the timer interval
            this.sessionTimerInterval = setInterval(() => {
                this.updateSessionTimerDisplay();
                this.checkSessionTimeRemaining();
            }, 1000);
            
            // Update UI to remove paused state
            const timerDisplay = document.getElementById('session-timer-display');
            if (timerDisplay) {
                timerDisplay.classList.remove('timer-paused');
            }
            
            this.updateSessionTimerDisplay();
        }
    }

    stopSessionTimer() {
        if (this.sessionTimerInterval) {
            clearInterval(this.sessionTimerInterval);
            this.sessionTimerInterval = null;
        }
        this.sessionPausedTime = null;
    }

    showSessionTimerUI() {
        const timerContainer = document.getElementById('session-timer-container');
        if (timerContainer) {
            timerContainer.style.display = 'flex';
        }
    }

    hideSessionTimerUI() {
        const timerContainer = document.getElementById('session-timer-container');
        if (timerContainer) {
            timerContainer.style.display = 'none';
        }
    }

    setAutoAdvanceSpeed(delayMs) {
        const safeDelayMs = Math.max(250, Number.isFinite(delayMs) ? delayMs : this.autoAdvanceDelayMs);
        this.autoAdvanceDelayMs = safeDelayMs;
        this.autoAdvanceInitialDelayMs = safeDelayMs + this.autoAdvanceInitialOffsetMs;
        this._updateSpeedValueUI(safeDelayMs);

        // If currently running, reschedule with new speed
        if (this.autoAdvanceEnabled) {
            if (this._hasNextLine() || this._hasNextConversation()) {
                const delay = this._isAtFirstLearnerLine()
                    ? this.autoAdvanceInitialDelayMs
                    : this.autoAdvanceDelayMs;
                this._scheduleAutoAdvance(delay);
            } else {
                this.stopAutoAdvance();
            }
        }
    }

    toggleAutoAdvance() {
        this.autoAdvanceEnabled = !this.autoAdvanceEnabled;

        if (!this.autoAdvanceEnabled) {
            this.stopAutoAdvance();
            // Pause the session timer when conversation is paused
            this.pauseSessionTimer();
        } else {
            // Resume the session timer when conversation is resumed
            this.resumeSessionTimer();
            
            // When resuming, prefer the "initial delay" if currently at the first learner line
            if (this._hasNextLine() || this._hasNextConversation()) {
                const delay = this._isAtFirstLearnerLine()
                    ? this.autoAdvanceInitialDelayMs
                    : this.autoAdvanceDelayMs;
                this._scheduleAutoAdvance(delay);
            }
        }

        this._syncAutoAdvanceButton();
    }

    _isAtFirstLearnerLine() {
        if (this.currentConversationIndex >= this.modifiedDialogue.length) return false;
        if (this.currentLineIndex < 0) return false;

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = conversation.split('\n');
        const firstLearnerLineIndex = lines.findIndex(line => line.includes('learner-name'));
        return firstLearnerLineIndex >= 0 && this.currentLineIndex === firstLearnerLineIndex;
    }

    _syncAutoAdvanceButton() {
        const btn = document.getElementById('toggle-auto-advance-btn');
        if (!btn) return;

        const isPaused = !this.autoAdvanceEnabled;
        btn.classList.toggle('is-paused', isPaused);
        btn.title = isPaused ? 'Resume auto scroll' : 'Pause auto scroll';
        btn.setAttribute('aria-label', isPaused ? 'Resume auto scroll' : 'Pause auto scroll');

        // Swap icon (lucide)
        btn.innerHTML = `<i data-lucide="${isPaused ? 'play' : 'pause'}"></i>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    stopAutoAdvance() {
        if (this.autoAdvanceTimeoutId) {
            clearTimeout(this.autoAdvanceTimeoutId);
            this.autoAdvanceTimeoutId = null;
        }
    }

    resumeAutoAdvance() {
        if (!this.autoAdvanceEnabled) return;
        if (this.isLoading) return;
        if (!this._hasNextLine() && !this._hasNextConversation()) return;
        
        // Use character-based timing for next line
        const currentLineText = this.getCurrentLineText();
        const delay = this.calculateDelayFromText(currentLineText);
        this._scheduleAutoAdvance(delay);
    }

    _scheduleAutoAdvance(delayMs) {
        if (!this.autoAdvanceEnabled) return;
        this.stopAutoAdvance();
        this.autoAdvanceTimeoutId = setTimeout(() => {
            this.autoAdvanceTimeoutId = null;
            this._autoAdvanceTick();
        }, delayMs);
    }

    _autoAdvanceTick() {
        if (!this.autoAdvanceEnabled) return;
        if (this.isLoading) return;

        const didAdvance = this.nextLine({ fromAutoAdvance: true });
        if (didAdvance) {
            // Calculate delay based on current line text
            const currentLineText = this.getCurrentLineText();
            const delay = this.calculateDelayFromText(currentLineText);
            this._scheduleAutoAdvance(delay);
            return;
        }

        // If conversation ended, jump to next conversation automatically
        if (this._hasNextConversation()) {
            this.setCurrentConversation(this.currentConversationIndex + 1);
            return; // setCurrentConversation schedules the initial delay
        }

        // Last conversation finished
        this.stopAutoAdvance();
    }

    _hasNextLine() {
        if (this.currentConversationIndex >= this.modifiedDialogue.length) return false;
        if (this.currentLineIndex < 0) return false;

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = conversation.split('\n');
        return this.currentLineIndex < lines.length - 1;
    }

    _hasNextConversation() {
        return this.currentConversationIndex >= 0 &&
               this.currentConversationIndex < this.modifiedDialogue.length - 1;
    }

    async initializeWithLearners(learnerNames, preselectedMinutes) {
        this.learnerNames = learnerNames || [];
        if (this.learnerNames.length === 0) {
            this.showError('No learners selected. Please go back and select learners.');
            return;
        }

        // Reset session tracking variables
        this.sessionStartTime = null;
        this.sessionEndTime = null;
        this.sessionDurationMinutes = null;
        this.sessionPausedTime = null;
        this.totalPausedDuration = 0;
        this.sessionWarningShown = false;

        // Use preselected duration from home page, or show modal (fallback)
        if (typeof preselectedMinutes === 'number') {
            if (preselectedMinutes > 0) {
                this.startSessionTimer(preselectedMinutes);
            }
        } else {
            await this.promptForSessionDuration();
        }

        await this.loadDialogue();
    }

    /**
     * Show session duration modal and return selected minutes (0 = no limit).
     * Call this from home page BEFORE navigating to dialogue so modal always displays.
     */
    showSessionDurationModal() {
        return new Promise((resolve) => {
            // Remove any existing modals first
            const existingModals = document.querySelectorAll('.session-duration-modal');
            existingModals.forEach(m => m.remove());

            const modal = document.createElement('div');
            modal.className = 'session-duration-modal';
            modal.id = 'session-duration-modal';
            modal.innerHTML = `
                <div class="session-duration-content">
                    <h3>⏱️ Set Learning Duration</h3>
                    <p>How long would you like to practice?</p>
                    <div class="duration-options">
                        <button class="duration-btn" data-minutes="5">5 Minutes</button>
                        <button class="duration-btn" data-minutes="10">10 Minutes</button>
                        <button class="duration-btn" data-minutes="15">15 Minutes</button>
                        <button class="duration-btn" data-minutes="30">30 Minutes</button>
                        <button class="duration-btn" data-minutes="0">No Limit</button>
                    </div>
                    <div class="custom-duration">
                        <input type="number" id="custom-duration-input" placeholder="Custom minutes" min="1" max="120" />
                        <button id="custom-duration-btn">Set Custom</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('show'), 50);

            const closeWithMinutes = (minutes) => {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.remove();
                    resolve(minutes);
                }, 300);
            };

            modal.querySelectorAll('.duration-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const minutes = parseInt(btn.dataset.minutes, 10);
                    closeWithMinutes(minutes);
                });
            });

            const customBtn = modal.querySelector('#custom-duration-btn');
            const customInput = modal.querySelector('#custom-duration-input');
            if (customBtn && customInput) {
                customBtn.addEventListener('click', () => {
                    const minutes = parseInt(customInput.value, 10);
                    if (minutes > 0 && minutes <= 120) {
                        closeWithMinutes(minutes);
                    } else {
                        alert('Please enter a valid duration (1-120 minutes)');
                    }
                });
                customInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') customBtn.click();
                });
            }
        });
    }

    promptForSessionDuration() {
        return this.showSessionDurationModal().then((minutes) => {
            if (minutes > 0) {
                this.startSessionTimer(minutes);
            }
        });
    }

    async loadDialogue() {
        this.setLoading(true);
        
        try {
            // Use embedded dialogue data instead of fetching files
            if (typeof getDialogueForLanguage === 'undefined') {
                throw new Error('Dialogue data not loaded. Please ensure dialogue-data.js is included.');
            }
            
            const dialogueText = getDialogueForLanguage(this.currentLanguage);
            
            if (!dialogueText || dialogueText.trim() === '') {
                throw new Error(`No dialogue content found for language: ${this.currentLanguage}`);
            }

            this.originalDialogue = dialogueText;
            
            // Apply translation if needed
            await this.applyTranslation();
            
            this.processDialogue();
            this.populateConversationSelector();
            this.setCurrentConversation(0);
            
        } catch (error) {
            console.error('Error loading dialogue:', error);
            this.showError(`Failed to load dialogue script for ${this.currentLanguage}. Available languages: ${getAvailableLanguages().join(', ')}`);
            
            // Navigate back to home after a delay
            setTimeout(() => {
                if (app) {
                    app.showPage('home');
                }
            }, 5000);
        } finally {
            this.setLoading(false);
        }
    }

    async applyTranslation() {
        if (window.app && window.app.translationService) {
            const currentLang = window.app.translationService.getCurrentLanguage();
            if (currentLang !== 'en') {
                try {
                    // For Google Translate Widget, the translation happens automatically
                    // when the content is displayed. We just need to ensure the service is ready.
                    console.log(`Translation will be applied for language: ${currentLang}`);
                    
                    // Update language display
                    const currentLanguageElement = document.getElementById('current-language');
                    if (currentLanguageElement) {
                        const langName = window.app.translationService.getSupportedLanguages()[currentLang] || 'English';
                        currentLanguageElement.textContent = langName;
                    }
                } catch (error) {
                    console.error('Translation setup failed:', error);
                }
            }
        }
    }

    async refreshCurrentDialogue() {
        // Store current state
        const currentConversation = this.currentConversationIndex;
        const currentLine = this.currentLineIndex;
        
        // Reload dialogue with current translation
        await this.loadDialogue();
        
        // Restore state if possible
        if (currentConversation >= 0 && currentConversation < this.modifiedDialogue.length) {
            setTimeout(() => {
                this.setCurrentConversation(currentConversation);
                if (currentLine >= 0) {
                    this.currentLineIndex = currentLine;
                    this.displayConversation();
                    this.scrollToHighlightedLine();
                    if (this.autoAdvanceEnabled) {
                        this.resumeAutoAdvance();
                    }
                }
            }, 500);
        }
    }

    processDialogue() {
        if (!this.originalDialogue || this.learnerNames.length === 0) {
            return;
        }

        // Replace speaker names with learner names
        const modifiedText = this.replaceAllBeforeColonWithLearners(this.originalDialogue, this.learnerNames);
        
        // Split into conversations
        this.modifiedDialogue = this.splitIntoConversations(modifiedText);
    }

    replaceAllBeforeColonWithLearners(text, learners) {
        if (!text || !Array.isArray(learners) || learners.length === 0) {
            return text;
        }

        const shuffledNames = this.shuffleArray([...learners]);
        const recentlyUsedNames = [];
        const minDistance = Math.min(3, learners.length - 1);

        const getRandomName = () => {
            return shuffledNames[Math.floor(Math.random() * shuffledNames.length)];
        };

        return text.replace(
            /^(.+?)\s*:(.*)$/gm,
            (match, beforeColon, afterColon) => {
                let assignedName = null;
                let attempts = 0;
                const maxAttempts = learners.length * 2;

                // Try to find a name that hasn't been recently used
                while (attempts < maxAttempts) {
                    const candidate = getRandomName();
                    attempts++;

                    if (!recentlyUsedNames.includes(candidate)) {
                        assignedName = candidate;
                        break;
                    }
                }

                // Fallback logic
                if (!assignedName) {
                    const fallbackPool = shuffledNames.filter(name => !recentlyUsedNames.includes(name));
                    assignedName = fallbackPool.length > 0 ? 
                        fallbackPool[Math.floor(Math.random() * fallbackPool.length)] : 
                        getRandomName();
                }

                recentlyUsedNames.push(assignedName);
                if (recentlyUsedNames.length > minDistance) {
                    recentlyUsedNames.shift();
                }

                return `<span class="learner-name"><strong>${assignedName}</strong></span>:<span class="conversation-text">${afterColon}</span>`;
            }
        );
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    splitIntoConversations(text) {
        const lines = text.split('\n');
        const conversations = [];
        let currentConversation = '';

        for (const line of lines) {
            if (line.includes('Conversation ') && currentConversation.trim() !== '') {
                conversations.push(currentConversation.trim());
                currentConversation = '';
            }
            currentConversation += line + '\n';
        }

        if (currentConversation.trim() !== '') {
            conversations.push(currentConversation.trim());
        }

        return conversations.filter(conv => conv.trim() !== '');
    }

    populateConversationSelector() {
        const selector = document.getElementById('conversation-selector');
        if (!selector) return;

        selector.innerHTML = '';
        
        this.modifiedDialogue.forEach((conversation, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Conversation ${index + 1}`;
            selector.appendChild(option);
        });
    }

    updateConversationHeading() {
        const headingEl = document.getElementById('conversation-heading');
        if (!headingEl) return;

        headingEl.replaceChildren();

        if (this.currentConversationIndex < 0 || this.currentConversationIndex >= this.modifiedDialogue.length) {
            return;
        }

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = String(conversation || '').split('\n');

        // Conversation heading lines are expected to be before the first learner line
        const firstLearnerLineIndex = lines.findIndex(line => String(line).includes('learner-name'));
        const headerLines = (firstLearnerLineIndex > 0 ? lines.slice(0, firstLearnerLineIndex) : lines.slice(0, 2))
            .map(l => String(l).trim())
            .filter(Boolean);

        // Show ONLY the title (ex: "At Hospital / Clinic"), not the "Conversation X" line
        const titleLine =
            headerLines.find(l => !l.includes('Conversation') && !l.includes(':') && !l.includes('learner-name')) ||
            `Conversation ${this.currentConversationIndex + 1}`;

        if (titleLine) {
            const titleDiv = document.createElement('div');
            titleDiv.className = 'conversation-title';
            titleDiv.textContent = titleLine;
            headingEl.appendChild(titleDiv);
        }
    }

    setCurrentConversation(index) {
        if (index < 0 || index >= this.modifiedDialogue.length) {
            return;
        }

        this.currentConversationIndex = index;
        this.currentLineIndex = -1;
        this.stopAutoAdvance();
        
        // Update conversation selector
        const selector = document.getElementById('conversation-selector');
        if (selector) {
            selector.value = index;
        }

        this.updateConversationHeading();

        // Set current line to first learner line, then display
        this.setFirstLearnerLine();

        // Auto-advance: calculate delay based on first line text
        if (this.autoAdvanceEnabled) {
            const firstLineText = this.getCurrentLineText();
            const delay = this.useCharacterBasedTiming ? 
                this.calculateDelayFromText(firstLineText) + 1000 : // Add extra 1s for first line
                this.autoAdvanceInitialDelayMs;
            this._scheduleAutoAdvance(delay);
        }
        this._syncAutoAdvanceButton();
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }

    getCurrentLineText() {
        if (this.currentConversationIndex >= this.modifiedDialogue.length) {
            return '';
        }
        if (this.currentLineIndex < 0) {
            return '';
        }

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = conversation.split('\n');
        return lines[this.currentLineIndex] || '';
    }

    displayConversation() {
        const scriptText = document.getElementById('script-text');
        if (!scriptText || this.currentConversationIndex >= this.modifiedDialogue.length) {
            return;
        }

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        scriptText.innerHTML = this.renderHighlightedDialogue(conversation);
    }

    renderHighlightedDialogue(dialogue) {
        const lines = dialogue.split('\n');
        // Determine which indices to show: current and next
        let currentIndex = this.currentLineIndex;
        if (currentIndex < 0) {
            // Fallback to first learner line if not set
            const firstLearnerLineIndex = lines.findIndex(l => l.includes('learner-name'));
            currentIndex = firstLearnerLineIndex >= 0 ? firstLearnerLineIndex : 0;
        }

        // Find the next non-empty line after current
        let nextIndex = -1;
        for (let i = currentIndex + 1; i < lines.length; i++) {
            if (String(lines[i]).trim() !== '') {
                nextIndex = i;
                break;
            }
        }

        const visibleIndices = [currentIndex];
        if (nextIndex !== -1) visibleIndices.push(nextIndex);

        return visibleIndices.map((index) => {
            const line = lines[index];
            const isHighlighted = index === currentIndex;
            const className = isHighlighted ? 'highlighted-line' : '';
            const id = isHighlighted ? 'highlighted-line' : '';
            return `<div class="${className}" id="${id}">${line}</div>`;
        }).join('');
    }

    setFirstLearnerLine() {
        if (this.currentConversationIndex >= this.modifiedDialogue.length) {
            return;
        }

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = conversation.split('\n');
        
        // Find the first line that contains learner-name class
        const firstLearnerLineIndex = lines.findIndex(line => 
            line.includes('learner-name')
        );
        
        this.currentLineIndex = firstLearnerLineIndex >= 0 ? firstLearnerLineIndex : 0;
        this.displayConversation();
        this.scrollToHighlightedLine();
    }

    nextLine(options = {}) {
        if (this.currentConversationIndex >= this.modifiedDialogue.length) {
            return false;
        }

        const conversation = this.modifiedDialogue[this.currentConversationIndex];
        const lines = conversation.split('\n');
        let didAdvance = false;
        
        if (this.currentLineIndex < lines.length - 1) {
            this.currentLineIndex++;
            this.displayConversation();
            this.scrollToHighlightedLine();
            didAdvance = true;
        }
        
        this.updateNavigationButtons();

        // Manual navigation should restart auto-advance with normal delay (5s)
        if (!options.fromAutoAdvance && this.autoAdvanceEnabled) {
            this.resumeAutoAdvance();
        }

        return didAdvance;
    }

    previousLine() {
        if (this.currentLineIndex > 0) {
            this.currentLineIndex--;
            this.displayConversation();
            this.scrollToHighlightedLine();
        }
        
        this.updateNavigationButtons();

        // Manual navigation should restart auto-advance with normal delay (5s)
        if (this.autoAdvanceEnabled) {
            this.resumeAutoAdvance();
        }
    }

    nextConversation() {
        if (this.currentConversationIndex < this.modifiedDialogue.length - 1) {
            this.setCurrentConversation(this.currentConversationIndex + 1);
        }
    }

    previousConversation() {
        if (this.currentConversationIndex > 0) {
            this.setCurrentConversation(this.currentConversationIndex - 1);
        }
    }

    scrollToHighlightedLine(options = {}) {
        const highlightedLine = document.getElementById('highlighted-line');
        if (!highlightedLine) return;

        const behavior = options.behavior || 'smooth';

        // Prefer scrolling only inside the conversation panel (avoid page scroll)
        const container = highlightedLine.closest('.conversation-block');
        if (container) {
            const containerRect = container.getBoundingClientRect();
            const lineRect = highlightedLine.getBoundingClientRect();

            // Distance of the line from the top of the container's visible area
            const lineOffsetInContainer = (lineRect.top - containerRect.top);

            // Center the highlighted line within the container
            const targetTop =
                container.scrollTop +
                lineOffsetInContainer -
                (containerRect.height / 2) +
                (lineRect.height / 2);

            const clampedTop = Math.max(0, Math.min(targetTop, container.scrollHeight - containerRect.height));
            container.scrollTo({ top: clampedTop, behavior });
            return;
        }

        // Fallback (should rarely happen)
        highlightedLine.scrollIntoView({ behavior, block: 'center' });
    }

    updateNavigationButtons() {
        const prevConversationBtn = document.getElementById('prev-conversation-btn');
        const nextConversationBtn = document.getElementById('next-conversation-btn');
        const prevLineBtn = document.getElementById('prev-line-btn');
        const nextLineBtn = document.getElementById('next-line-btn');

        // Conversation navigation
        if (prevConversationBtn) {
            prevConversationBtn.disabled = this.currentConversationIndex <= 0;
        }
        
        if (nextConversationBtn) {
            nextConversationBtn.disabled = this.currentConversationIndex >= this.modifiedDialogue.length - 1;
        }

        // Line navigation
        if (prevLineBtn) {
            prevLineBtn.disabled = this.currentLineIndex <= 0;
        }
        
        if (nextLineBtn && this.currentConversationIndex < this.modifiedDialogue.length) {
            const conversation = this.modifiedDialogue[this.currentConversationIndex];
            const lines = conversation.split('\n');
            nextLineBtn.disabled = this.currentLineIndex >= lines.length - 1;
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        const scriptText = document.getElementById('script-text');
        const headingEl = document.getElementById('conversation-heading');
        
        if (scriptText) {
            if (loading) {
                scriptText.innerHTML = '<div class="loading">Loading dialogue...</div>';
            }
        }

        if (headingEl && loading) {
            headingEl.replaceChildren();
        }
    }

    showError(message) {
        const scriptText = document.getElementById('script-text');
        const headingEl = document.getElementById('conversation-heading');
        if (scriptText) {
            scriptText.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 2rem;">
                    <h3>Error</h3>
                    <p>${message}</p>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">
                        Redirecting to home page in 5 seconds...
                    </p>
                </div>
            `;
        }

        if (headingEl) {
            headingEl.replaceChildren();
        }
    }

    // Public methods
    setLanguage(language) {
        this.currentLanguage = language;
        const languageElement = document.getElementById('current-language');
        if (languageElement) {
            languageElement.textContent = language;
        }
    }

    getCurrentConversation() {
        return this.currentConversationIndex;
    }

    getCurrentLine() {
        return this.currentLineIndex;
    }

    getTotalConversations() {
        return this.modifiedDialogue.length;
    }

    getLearnerNames() {
        return this.learnerNames;
    }

    // Cleanup method - call when leaving the dialogue page
    cleanup() {
        this.stopAutoAdvance();
        this.stopSessionTimer();
        this.hideSessionTimerUI();
        this.sessionPausedTime = null;
        this.totalPausedDuration = 0;
        this.sessionStartTime = null;
        this.sessionEndTime = null;
        this.sessionDurationMinutes = null;
        this.sessionWarningShown = false;
        
        // Remove any lingering modals
        const modals = document.querySelectorAll('.session-duration-modal, .time-expired-modal');
        modals.forEach(m => m.remove());
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DialoguePage;
} 