import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { GoogleGenAI, Type, Chat } from "@google/genai";

// --- Type definitions ---
type Difficulty = 'A1' | 'B1' | 'C1';
type Theme = 'light' | 'dark' | 'ocean' | 'forest';
type Persona = 'friendly' | 'formal';
type FontSize = 'small' | 'medium' | 'large';
type View = 'home' | 'story' | 'pronunciation' | 'conversation' | 'writingAnalysis' | 'languageTools' | 'sentenceBuilder' | 'grammarGauntlet' | 'idiomQuest' | 'exams' | 'learningPath';
type LanguageTool = 'vocabulary' | 'dictionary' | 'translation' | 'phrases' | 'phrasalVerbs';
type ExamType = 'comprehensive' | 'reading_vocab' | 'writing_grammar' | 'listening_speaking';
type ExamState = 'setup' | 'in-progress' | 'results';
type QuestionType = 'mcq' | 'writing' | 'speaking' | 'listening';

interface User {
  name: string;
  email: string;
}

interface Settings {
  difficulty: Difficulty;
  theme: Theme;
  persona: Persona;
  translationLanguage: string;
  fontSize: FontSize;
  isIncognito: boolean;
}

interface ExamSettings {
  type: ExamType;
  questions: 5 | 10 | 15;
}

interface ExamQuestion {
  id: number;
  type: QuestionType;
  text: string;
  options?: string[];
}

interface UserAnswer {
  questionId: number;
  answer: string;
}

interface ExamResult {
  overallScore: number;
  summary: string;
  feedback: {
    questionId: number;
    questionText: string;
    userAnswer: string;
    isCorrect: boolean;
    feedback: string;
  }[];
}

interface WordOfTheDay {
    word: string;
    definition: string;
    example: string;
}

interface SpeakingFeedback {
  accuracyScore: number;
  pronunciationTips: {
    word: string;
    tip: string;
  }[];
  fluencyComment: string;
  grammarComment: string;
}

interface SpeakingTurn {
  role: 'ai' | 'user';
  text: string;
  feedback?: SpeakingFeedback;
}

interface SentenceTask {
  id: number;
  original: string;
  scrambled: string[];
}

interface GrammarTask {
    id: number;
    incorrectSentence: string;
    correctSentence: string;
    explanation: string;
}

interface IdiomQuestTask {
  id: number;
  contextSentence: string;
  correctIdiom: string;
  options: string[];
  correctMeaning: string;
  explanation: string;
}

interface LearningTask {
  id: string;
  description: string;
  type: View;
  completed: boolean;
}

interface DailyPlan {
  day: string;
  tasks: LearningTask[];
}

interface LearningPlan {
    plan: DailyPlan[];
    objective: string;
}

interface PlanSetupOptions {
    focus: 'integral' | 'speaking' | 'writing' | 'vocabulary' | 'exam';
    activities: View[];
}


// --- Constants ---
const difficultyLevels: Record<Difficulty, string> = { 'A1': 'Beginner', 'B1': 'Intermediate', 'C1': 'Advanced' };
const personaTypes: Record<Persona, string> = { 'friendly': 'Friendly Tutor', 'formal': 'Formal Examiner' };
const personaInstructions: Record<Persona, string> = {
  friendly: 'You are a friendly and encouraging English tutor. Your feedback is positive and gentle.',
  formal: 'You are a formal English examiner. Your feedback is precise, professional, and direct.',
};
const viewIcons: Record<View, string> = { home: 'home', story: 'auto_stories', pronunciation: 'record_voice_over', conversation: 'chat', writingAnalysis: 'edit_document', languageTools: 'library_books', sentenceBuilder: 'construction', grammarGauntlet: 'spellcheck', idiomQuest: 'extension', exams: 'quiz', learningPath: 'timeline' };
const viewNames: Record<View, string> = { home: 'Home', story: 'Story Practice', pronunciation: 'Speaking Practice', conversation: 'AI Conversation', writingAnalysis: 'Writing Analysis', languageTools: 'Language Tools', sentenceBuilder: 'SentenceBuilder', grammarGauntlet: 'Grammar Gauntlet', idiomQuest: 'Idiom Quest', exams: 'Exams', learningPath: 'Learning Path' };
const navGroups: {title: string; items: View[]}[] = [
    { title: 'Main', items: ['home', 'learningPath'] },
    { title: 'Practice', items: ['pronunciation', 'conversation', 'story'] },
    { title: 'Activities', items: ['sentenceBuilder', 'grammarGauntlet', 'idiomQuest'] },
    { title: 'Review & Tools', items: ['writingAnalysis', 'exams', 'languageTools'] },
];

const themeOptions: Record<Theme, { name: string; icon: string }> = {
    light: { name: 'Light', icon: 'light_mode' },
    dark: { name: 'Dark', icon: 'dark_mode' },
    ocean: { name: 'Ocean', icon: 'water' },
    forest: { name: 'Forest', icon: 'forest' },
};
const translationLanguages = ['Spanish', 'French', 'German', 'Mandarin', 'Japanese', 'Hindi'];
const fontSizes: Record<FontSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };


// --- Speech Recognition/Synthesis setup ---
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: any;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
}
const synth = window.speechSynthesis;

const SettingsModal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!isOpen) return null;

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="Close settings">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    modalRoot
  );
};

const getStorageKey = (email: string) => `lingosphere-app-data-${email}`;

const App = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [settings, setSettings] = useState<Settings>({ difficulty: 'A1', theme: 'light', persona: 'friendly', translationLanguage: 'Spanish', fontSize: 'medium', isIncognito: false });
  const [activeView, setActiveView] = useState<View>('home');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // For secondary loaders
  const [wordOfTheDay, setWordOfTheDay] = useState<WordOfTheDay | null>(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(true);
  const [microphonePermission, setMicrophonePermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [viewKey, setViewKey] = useState(Date.now());


  // --- Mode-specific state ---
  const [story, setStory] = useState({ text: '', question: '' });
  const [storyAnswer, setStoryAnswer] = useState('');
  const [storyFeedback, setStoryFeedback] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speakingHistory, setSpeakingHistory] = useState<SpeakingTurn[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  const [dictionaryWord, setDictionaryWord] = useState('');
  const [dictionaryResult, setDictionaryResult] = useState<{ word: string; partOfSpeech: string; definition: string; example: string } | null>(null);
  const [vocabularyList, setVocabularyList] = useState<{ word: string; definition: string; example: string; }[]>([]);
  const [translationTask, setTranslationTask] = useState({ sentence: '', feedback: '' });
  const [userTranslation, setUserTranslation] = useState('');
  const [writingInput, setWritingInput] = useState('');
  const [writingFeedback, setWritingFeedback] = useState<{ overall: string; grammar: string; style: string; vocabulary: string; } | null>(null);
  const [phrasalVerb, setPhrasalVerb] = useState<{ verb: string; definition: string; example: string; } | null>(null);
  const [commonPhrase, setCommonPhrase] = useState<{ phrase: string; meaning: string; example: string; } | null>(null);
  const [activeLanguageTool, setActiveLanguageTool] = useState<LanguageTool>('vocabulary');
  const [sentenceTask, setSentenceTask] = useState<SentenceTask | null>(null);
  const [userSentence, setUserSentence] = useState<string[]>([]);
  const [sentenceFeedback, setSentenceFeedback] = useState<{ correct: boolean; message: string; } | null>(null);
  const [grammarTask, setGrammarTask] = useState<GrammarTask | null>(null);
  const [userCorrection, setUserCorrection] = useState('');
  const [grammarFeedback, setGrammarFeedback] = useState<{ isCorrect: boolean; explanation: string; } | null>(null);
  const [idiomQuestTask, setIdiomQuestTask] = useState<IdiomQuestTask | null>(null);
  const [idiomQuestAnswer, setIdiomQuestAnswer] = useState<string | null>(null);
  
  // --- Learning Path State ---
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [planSetupOptions, setPlanSetupOptions] = useState<PlanSetupOptions>({
      focus: 'integral',
      activities: [],
  });


  // --- Exam State ---
  const [examState, setExamState] = useState<ExamState>('setup');
  const [examSettings, setExamSettings] = useState<ExamSettings>({ type: 'comprehensive', questions: 5 });
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [examResults, setExamResults] = useState<ExamResult | null>(null);

  // --- Refs ---
  const [popup, setPopup] = useState<{text: string; x: number; y: number, loading: boolean, original?: string}>({text: '', x: 0, y: 0, loading: false});
  const mainContentRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // --- Effects ---
   useEffect(() => {
    if (!SpeechRecognition) {
        setIsSpeechRecognitionSupported(false);
        console.warn("Speech recognition not supported by this browser.");
    } else if (navigator.permissions) {
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then(status => {
            setMicrophonePermission(status.state);
            status.onchange = () => {
                setMicrophonePermission(status.state);
            };
        }).catch((err) => {
            console.warn("Could not query microphone permission. Proceeding with default behavior.", err);
        });
    }
  }, []);

  useEffect(() => {
    document.body.className = `${settings.theme}-theme`;
    document.body.dataset.fontSize = settings.fontSize;
  }, [settings.theme, settings.fontSize]);

  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, speakingHistory]);
  
  useEffect(() => {
    if (!isRecording && transcript.trim()) {
        processSpeech(transcript.trim());
    }
  }, [isRecording, transcript]);

  useEffect(() => {
    const handleMouseUp = async (event: MouseEvent) => {
      const popupEl = document.querySelector('.translation-popup');
      if (popupEl && !popupEl.contains(event.target as Node)) {
        setPopup({text: '', x: 0, y: 0, loading: false});
      }
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? '';
      
      if (selectedText.length > 0 && selectedText.length < 100 && mainContentRef.current?.contains(selection.anchorNode)) {
        const activeEl = document.activeElement;
        if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setPopup({ text: '', x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 5, loading: true, original: selectedText });
        
        try {
          const prompt = `Translate the following English text to ${settings.translationLanguage}: "${selectedText}"`;
          const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
          setPopup(p => ({ ...p, text: response.text, loading: false }));
        } catch (e) {
          console.error("Translation error", e);
          setPopup({text: 'Translation failed.', x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 5, loading: false});
        }
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [settings.translationLanguage]); // Rerun if translation language changes

  // Load state from localStorage on mount
  useEffect(() => {
    const loadState = () => {
      try {
        const storageKey = getStorageKey(user.email);
        const savedStateJSON = localStorage.getItem(storageKey);
  
        if (savedStateJSON) {
          const savedState = JSON.parse(savedStateJSON);
  
          if (savedState.settings?.isIncognito) {
            localStorage.removeItem(storageKey);
            initializeChat();
            setIsStateLoaded(true);
            return;
          }
  
          if (savedState.settings) setSettings(savedState.settings);
          if (savedState.activeView) setActiveView(savedState.activeView);
          if (savedState.wordOfTheDay) setWordOfTheDay(savedState.wordOfTheDay);
          if (savedState.story) setStory(savedState.story);
          if (savedState.storyAnswer) setStoryAnswer(savedState.storyAnswer);
          if (savedState.storyFeedback) setStoryFeedback(savedState.storyFeedback);
          if (savedState.speakingHistory) setSpeakingHistory(savedState.speakingHistory);
          
          if (savedState.chatHistory && savedState.chatHistory.length > 0) {
            setChatHistory(savedState.chatHistory);
            const apiHistory = savedState.chatHistory.map((msg: any) => ({
              role: msg.role,
              parts: [{ text: msg.text }]
            }));
            const currentSettings = savedState.settings || settings;
            const newChat = ai.chats.create({
              model: 'gemini-2.5-flash',
              history: apiHistory,
              config: { systemInstruction: personaInstructions[currentSettings.persona] + ` You are having a conversation with a ${difficultyLevels[currentSettings.difficulty]} level English learner.` }
            });
            setChat(newChat);
          } else {
            initializeChat();
          }
  
          if (savedState.dictionaryWord) setDictionaryWord(savedState.dictionaryWord);
          if (savedState.dictionaryResult) setDictionaryResult(savedState.dictionaryResult);
          if (savedState.vocabularyList) setVocabularyList(savedState.vocabularyList);
          if (savedState.translationTask) setTranslationTask(savedState.translationTask);
          if (savedState.userTranslation) setUserTranslation(savedState.userTranslation);
          if (savedState.writingInput) setWritingInput(savedState.writingInput);
          if (savedState.writingFeedback) setWritingFeedback(savedState.writingFeedback);
          if (savedState.phrasalVerb) setPhrasalVerb(savedState.phrasalVerb);
          if (savedState.commonPhrase) setCommonPhrase(savedState.commonPhrase);
          if (savedState.activeLanguageTool) setActiveLanguageTool(savedState.activeLanguageTool);
          if (savedState.sentenceTask) setSentenceTask(savedState.sentenceTask);
          if (savedState.userSentence) setUserSentence(savedState.userSentence);
          if (savedState.sentenceFeedback) setSentenceFeedback(savedState.sentenceFeedback);
          if (savedState.grammarTask) setGrammarTask(savedState.grammarTask);
          if (savedState.userCorrection) setUserCorrection(savedState.userCorrection);
          if (savedState.grammarFeedback) setGrammarFeedback(savedState.grammarFeedback);
          if (savedState.idiomQuestTask) setIdiomQuestTask(savedState.idiomQuestTask);
          if (savedState.idiomQuestAnswer) setIdiomQuestAnswer(savedState.idiomQuestAnswer);
          if (savedState.examState) setExamState(savedState.examState);
          if (savedState.examSettings) setExamSettings(savedState.examSettings);
          if (savedState.examQuestions) setExamQuestions(savedState.examQuestions);
          if (savedState.currentQuestionIndex) setCurrentQuestionIndex(savedState.currentQuestionIndex);
          if (savedState.userAnswers) setUserAnswers(savedState.userAnswers);
          if (savedState.examResults) setExamResults(savedState.examResults);
          if (savedState.learningPlan) {
            const planWithCompletion = {
                ...savedState.learningPlan,
                plan: savedState.learningPlan.plan.map((day: DailyPlan) => ({
                    ...day,
                    tasks: day.tasks.map((task: LearningTask) => ({
                        ...task,
                        completed: task.completed || false,
                    })),
                })),
            };
            setLearningPlan(planWithCompletion);
          }
          if (savedState.planSetupOptions) setPlanSetupOptions(savedState.planSetupOptions);

          
        } else {
            generateWordOfTheDay();
            initializeChat();
        }
      } catch (e) {
        console.error("Failed to load or parse state from localStorage", e);
        const storageKey = getStorageKey(user.email);
        localStorage.removeItem(storageKey);
        initializeChat();
      } finally {
        setIsStateLoaded(true);
      }
    };
  
    loadState();
  }, [user.email]);

  // Save state to localStorage on change
  useEffect(() => {
    if (!isStateLoaded || settings.isIncognito) {
      return;
    }
  
    const appState = {
      settings,
      activeView,
      wordOfTheDay,
      story,
      storyAnswer,
      storyFeedback,
      speakingHistory,
      chatHistory,
      dictionaryWord,
      dictionaryResult,
      vocabularyList,
      translationTask,
      userTranslation,
      writingInput,
      writingFeedback,
      phrasalVerb,
      commonPhrase,
      activeLanguageTool,
      sentenceTask,
      userSentence,
      sentenceFeedback,
      grammarTask,
      userCorrection,
      grammarFeedback,
      idiomQuestTask,
      idiomQuestAnswer,
      examState,
      examSettings,
      examQuestions,
      currentQuestionIndex,
      userAnswers,
      examResults,
      learningPlan,
      planSetupOptions,
    };
  
    try {
      const storageKey = getStorageKey(user.email);
      localStorage.setItem(storageKey, JSON.stringify(appState));
    } catch (e) {
      console.error("Failed to save state to localStorage", e);
    }
  }, [
      isStateLoaded, settings, activeView, wordOfTheDay, story, storyAnswer, storyFeedback,
      speakingHistory, chatHistory, dictionaryWord, dictionaryResult, vocabularyList,
      translationTask, userTranslation, writingInput, writingFeedback, phrasalVerb,
      commonPhrase, activeLanguageTool, sentenceTask, userSentence, sentenceFeedback,
      grammarTask, userCorrection, grammarFeedback, idiomQuestTask, idiomQuestAnswer,
      examState, examSettings, examQuestions, currentQuestionIndex, userAnswers, examResults,
      learningPlan, planSetupOptions
  ]);

  // --- Handlers ---
  const handleSettingChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const changeView = (view: View) => {
    setIsSidebarExpanded(false);
    setError('');
    setActiveView(view);
    if (view !== 'exams') {
        setExamState('setup');
        setExamResults(null);
    }
    switch(view) {
        case 'story': if (!story.text) generateStory(); break;
        case 'pronunciation': 
            if (speakingHistory.length === 0) {
              startSpeakingPractice();
            }
            break;
        case 'conversation': 
            if (!chat || settings.isIncognito) {
                initializeChat(); 
            }
            break;
        case 'languageTools':
            if (activeLanguageTool === 'vocabulary' && vocabularyList.length === 0) {
              generateVocabulary();
            }
            break;
        case 'writingAnalysis': setWritingInput(''); setWritingFeedback(null); break;
        case 'sentenceBuilder': if (!sentenceTask) generateSentenceTask(); break;
        case 'grammarGauntlet': if (!grammarTask) generateGrammarTask(); break;
        case 'idiomQuest': if (!idiomQuestTask) generateIdiomQuestTask(); break;
        case 'learningPath': break;
        default: break;
    }
    setViewKey(Date.now());
  };

  const generateContent = async (prompt: string, schema?: any, systemInstruction?: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", contents: prompt,
        config: {
          ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
          ...(systemInstruction ? { systemInstruction } : {})
        },
      });
      return response;
    } catch (e) {
      console.error(e); setError('An error occurred. Please try again.');
      return null;
    }
  };

  // --- Core Function Implementations ---
  const generateWordOfTheDay = async () => {
    const schema = {type: Type.OBJECT, properties: { word: {type: Type.STRING}, definition: {type: Type.STRING}, example: {type: Type.STRING} }, required: ['word', 'definition', 'example']};
    const response = await generateContent("Generate an interesting English word of the day appropriate for an intermediate learner.", schema);
    if(response) setWordOfTheDay(JSON.parse(response.text));
  }

  const generateStory = async () => {
    setIsLoading(true); setStory({text: '', question: ''}); setStoryAnswer(''); setStoryFeedback('');
    const schema = {type: Type.OBJECT, properties: { story: {type: Type.STRING}, question: {type: Type.STRING}}, required: ['story', 'question']};
    const prompt = `Generate a short story (3-4 paragraphs) and a comprehension question about it for an English learner at the ${difficultyLevels[settings.difficulty]} level.`;
    const response = await generateContent(prompt, schema);
    if(response) {
      const data = JSON.parse(response.text);
      setStory({text: data.story, question: data.question});
    }
    setIsLoading(false);
  };

  const checkStoryAnswer = async (e: React.FormEvent) => {
    e.preventDefault(); if(!storyAnswer) return;
    setIsSubmitting(true); setStoryFeedback('');
    const prompt = `A ${difficultyLevels[settings.difficulty]} English learner was told the story: "${story.text}". They were asked: "${story.question}". Their answer was: "${storyAnswer}". Provide feedback on their comprehension and grammar.`;
    const response = await generateContent(prompt, undefined, personaInstructions[settings.persona]);
    if(response) setStoryFeedback(response.text);
    setIsSubmitting(false);
  };
  
  const startSpeakingPractice = async () => {
    setIsLoading(true);
    setSpeakingHistory([]);
    const prompt = `You are an English tutor starting a role-playing conversation for a ${difficultyLevels[settings.difficulty]} learner. Start a common scenario, like ordering at a coffee shop, asking for directions, or a simple check-in at a hotel. Provide only the first line of the conversation as a single string. Be welcoming and clear.`;
    const response = await generateContent(prompt);
    if (response && response.text) {
        setSpeakingHistory([{ role: 'ai', text: response.text }]);
    } else {
        setError("Could not start speaking practice. Please try again.");
        setSpeakingHistory([{ role: 'ai', text: "Hello! Let's practice speaking. Tell me about your day." }]);
    }
    setIsLoading(false);
  }

  const handleSpeakingRecordToggle = () => {
      if (!isSpeechRecognitionSupported || !recognition) {
        setError("Speech recognition is not supported on this browser. Please try a different browser like Chrome.");
        return;
      }

      if (isRecording) {
          recognition.stop();
          // The onend handler will set isRecording to false.
      } else {
          setError('');
          setTranscript('');
          recognition.onresult = (e: any) => {
              const fullTranscript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
              setTranscript(fullTranscript);
          };
          recognition.onend = () => {
              setIsRecording(false);
          };
          // Add robust error handling
          recognition.onerror = (event: any) => {
              console.error('Speech Recognition Error:', event.error);
              let errorMessage = `An error occurred during speech recognition: ${event.error}.`;
              if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                  errorMessage = "Microphone access was denied. Please allow microphone access in your browser settings to use this feature.";
                  setMicrophonePermission('denied');
              }
              setError(errorMessage);
              setIsRecording(false);
          };
          recognition.start();
          setIsRecording(true);
      }
  };

  const processSpeech = async (userTranscript: string) => {
      if(!userTranscript) return;
      setIsSubmitting(true);
      setError('');
      setSpeakingHistory(prev => [...prev, { role: 'user', text: userTranscript }]);

      const feedbackSchema = {
          type: Type.OBJECT,
          properties: {
            accuracyScore: { type: Type.NUMBER, description: "A score from 0-100 on how well the user's response fits the context and is grammatically correct." },
            pronunciationTips: {
              type: Type.ARRAY,
              description: "Tips for 1-3 specific words the user might have struggled with based on common pronunciation errors for their likely accent. Identify the word and provide a simple tip.",
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  tip: { type: Type.STRING },
                },
                required: ['word', 'tip']
              }
            },
            fluencyComment: { type: Type.STRING, description: "A brief, encouraging comment on the user's conversational fluency." },
            grammarComment: { type: Type.STRING, description: "A brief, encouraging comment on the user's grammar." },
            aiResponse: { type: Type.STRING, description: "Your next line in the conversation to continue the role-play. Keep it natural and engaging." }
          },
          required: ['accuracyScore', 'pronunciationTips', 'fluencyComment', 'grammarComment', 'aiResponse']
        };

      const conversationContext = speakingHistory.map(turn => `${turn.role}: ${turn.text}`).join('\n');
      const prompt = `An English learner at the ${difficultyLevels[settings.difficulty]} level is in a role-playing conversation. Here is the conversation so far:\n${conversationContext}\nThe user just responded with: "${userTranscript}"\nPlease analyze their response. Provide structured feedback and your next line in the conversation according to the provided JSON schema.`;
      
      const response = await generateContent(prompt, feedbackSchema, personaInstructions[settings.persona]);

      if (response && response.text) {
          try {
              const result = JSON.parse(response.text);
              const feedback: SpeakingFeedback = {
                  accuracyScore: result.accuracyScore,
                  pronunciationTips: result.pronunciationTips,
                  fluencyComment: result.fluencyComment,
                  grammarComment: result.grammarComment
              };

              setSpeakingHistory(prev => {
                  const newHistory = [...prev];
                  const lastTurn = newHistory[newHistory.length - 1];
                  if (lastTurn.role === 'user') {
                      lastTurn.feedback = feedback;
                  }
                  return newHistory;
              });
              
              setTimeout(() => {
                  setSpeakingHistory(prev => [...prev, { role: 'ai', text: result.aiResponse }]);
                  setIsSubmitting(false);
                  setTranscript('');
              }, 500);

          } catch (e) {
              console.error("Failed to parse speaking feedback:", e);
              setSpeakingHistory(prev => [...prev, { role: 'ai', text: "That's interesting! Could you tell me more?" }]);
              setIsSubmitting(false);
              setTranscript('');
          }
      } else {
          setSpeakingHistory(prev => [...prev, { role: 'ai', text: "Sorry, I had a little trouble understanding. Can you say that again?" }]);
          setIsSubmitting(false);
          setTranscript('');
      }
  };
  
  const initializeChat = async () => {
      setIsLoading(true); setChatHistory([]);
      const newChat = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: { systemInstruction: personaInstructions[settings.persona] + ` You are having a conversation with a ${difficultyLevels[settings.difficulty]} level English learner.` }
      });
      setChat(newChat);
      setChatHistory([{ role: 'model', text: 'Hello! What would you like to talk about today?' }]);
      setIsLoading(false);
  };
  
  const sendChatMessage = async (e: React.FormEvent) => {
      e.preventDefault(); if (!chatMessage || !chat) return;
      const userMessage = chatMessage;
      setChatMessage('');
      setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
      setIsSubmitting(true);

      const response = await chat.sendMessage({ message: userMessage });
      setChatHistory(prev => [...prev, { role: 'model', text: response.text }]);
      setIsSubmitting(false);
  };
  
  const searchDictionary = async (e: React.FormEvent) => {
    e.preventDefault(); if(!dictionaryWord) return;
    setIsSubmitting(true); setDictionaryResult(null);
    const schema = {type: Type.OBJECT, properties: { word: {type: Type.STRING}, partOfSpeech: {type: Type.STRING}, definition: {type: Type.STRING}, example: {type: Type.STRING}}, required: ['word', 'partOfSpeech', 'definition', 'example']};
    const prompt = `Provide a dictionary entry for the word "${dictionaryWord}".`;
    const response = await generateContent(prompt, schema);
    if(response) setDictionaryResult(JSON.parse(response.text));
    setIsSubmitting(false);
  };

  const generateVocabulary = async () => {
    setIsLoading(true); setVocabularyList([]);
    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: { word: {type: Type.STRING}, definition: {type: Type.STRING}, example: {type: Type.STRING} },
            required: ['word', 'definition', 'example']
        }
    };
    const prompt = `Generate a list of 5 vocabulary words appropriate for a ${difficultyLevels[settings.difficulty]} English learner. For each word, provide a simple definition and an example sentence.`;
    const response = await generateContent(prompt, schema);
    if(response) setVocabularyList(JSON.parse(response.text));
    setIsLoading(false);
  };

  const generateTranslationTask = async () => {
    setIsLoading(true); setUserTranslation(''); setTranslationTask({sentence: '', feedback: ''});
    const prompt = `Provide a single, interesting English sentence to be translated into ${settings.translationLanguage}, appropriate for a ${difficultyLevels[settings.difficulty]} level learner. Just the sentence, no extra text.`;
    const response = await generateContent(prompt);
    if(response) setTranslationTask({sentence: response.text, feedback: ''});
    setIsLoading(false);
  };

  const checkTranslation = async (e: React.FormEvent) => {
    e.preventDefault(); if(!userTranslation) return;
    setIsSubmitting(true);
    const prompt = `A ${difficultyLevels[settings.difficulty]} learner was asked to translate "${translationTask.sentence}" into ${settings.translationLanguage}. Their translation was "${userTranslation}". Provide feedback on the translation's accuracy and grammar in simple English.`;
    const response = await generateContent(prompt, undefined, personaInstructions[settings.persona]);
    if(response) setTranslationTask(prev => ({ ...prev, feedback: response.text }));
    setIsSubmitting(false);
  };

  const analyzeWriting = async (e: React.FormEvent) => {
    e.preventDefault(); if(!writingInput) return;
    setIsSubmitting(true); setWritingFeedback(null);
    const schema = {
        type: Type.OBJECT,
        properties: {
            overall: { type: Type.STRING, description: "Overall feedback on the text." },
            grammar: { type: Type.STRING, description: "Specific feedback on grammar and correctness." },
            style: { type: Type.STRING, description: "Feedback on writing style, tone, and flow." },
            vocabulary: { type: Type.STRING, description: "Feedback on word choice and vocabulary usage." }
        },
        required: ['overall', 'grammar', 'style', 'vocabulary']
    };
    const prompt = `Analyze the following English text written by a ${difficultyLevels[settings.difficulty]} level learner. Provide structured feedback. \n\nText: "${writingInput}"`;
    const response = await generateContent(prompt, schema, personaInstructions[settings.persona]);
    if(response) setWritingFeedback(JSON.parse(response.text));
    setIsSubmitting(false);
  };

  const generatePhrasalVerb = async () => {
    setIsLoading(true); setPhrasalVerb(null);
    const schema = { type: Type.OBJECT, properties: { verb: {type: Type.STRING}, definition: {type: Type.STRING}, example: {type: Type.STRING} }, required: ['verb', 'definition', 'example'] };
    const prompt = `Provide one common English phrasal verb, its definition, and an example sentence. It should be suitable for a ${difficultyLevels[settings.difficulty]} learner.`;
    const response = await generateContent(prompt, schema);
    if(response) setPhrasalVerb(JSON.parse(response.text));
    setIsLoading(false);
  };
  
  const generateCommonPhrase = async () => {
    setIsLoading(true); setCommonPhrase(null);
    const schema = { type: Type.OBJECT, properties: { phrase: {type: Type.STRING}, meaning: {type: Type.STRING}, example: {type: Type.STRING} }, required: ['phrase', 'meaning', 'example'] };
    const prompt = `Provide one common English idiom or phrase, its meaning, and an example sentence. It should be suitable for a ${difficultyLevels[settings.difficulty]} learner.`;
    const response = await generateContent(prompt, schema);
    if(response) setCommonPhrase(JSON.parse(response.text));
    setIsLoading(false);
  };

  // --- Sentence Builder ---
  const generateSentenceTask = async () => {
    setIsLoading(true);
    setSentenceTask(null);
    setUserSentence([]);
    setSentenceFeedback(null);

    const prompt = `Generate a single, grammatically correct English sentence appropriate for a ${difficultyLevels[settings.difficulty]} level learner. The sentence should be between 7 and 14 words long. The sentence must not contain complex punctuation like commas. Just provide the sentence as a single string.`;
    const response = await generateContent(prompt);
    if (response && response.text) {
      const original = response.text.trim().replace(/\.$/, '');
      const words = original.split(' ');
      const scrambled = [...words].sort(() => Math.random() - 0.5);
      // Ensure it's actually scrambled
      if (JSON.stringify(words) === JSON.stringify(scrambled)) {
         scrambled.reverse();
      }
      setSentenceTask({ id: Date.now(), original, scrambled });
    } else {
      setError("Could not generate a sentence. Please try again.");
    }
    setIsLoading(false);
  };

  const handleWordBankClick = (word: string, index: number) => {
    if (sentenceFeedback) return;
    setUserSentence(prev => [...prev, word]);
    const newScrambled = [...(sentenceTask?.scrambled ?? [])];
    newScrambled.splice(index, 1);
    setSentenceTask(prev => prev ? ({ ...prev, scrambled: newScrambled }) : null);
  };
  
  const handleUserSentenceClick = (word: string, index: number) => {
    if (sentenceFeedback) return;
    setSentenceTask(prev => prev ? ({ ...prev, scrambled: [...prev.scrambled, word] }) : null);
    const newUserSentence = [...userSentence];
    newUserSentence.splice(index, 1);
    setUserSentence(newUserSentence);
  };

  const checkSentence = () => {
    if (!sentenceTask) return;
    const isCorrect = userSentence.join(' ') === sentenceTask.original;
    if (isCorrect) {
      setSentenceFeedback({ correct: true, message: 'Excellent! That\'s the correct sentence.' });
    } else {
      setSentenceFeedback({ correct: false, message: `Not quite. The correct sentence was: "${sentenceTask.original}"` });
    }
  };

  const resetSentence = () => {
    if (!sentenceTask) return;
    const allWords = [...userSentence, ...sentenceTask.scrambled];
    setSentenceTask(prev => prev ? ({ ...prev, scrambled: allWords }) : null);
    setUserSentence([]);
    setSentenceFeedback(null);
  };
  
  // --- Grammar Gauntlet ---
  const generateGrammarTask = async () => {
    setIsLoading(true);
    setGrammarTask(null);
    setUserCorrection('');
    setGrammarFeedback(null);

    const schema = {
        type: Type.OBJECT,
        properties: {
            incorrectSentence: { type: Type.STRING, description: "A single English sentence with one common grammatical mistake." },
            correctSentence: { type: Type.STRING, description: "The corrected version of the sentence." },
            explanation: { type: Type.STRING, description: "A simple, one-sentence explanation of the error and the correction." }
        },
        required: ['incorrectSentence', 'correctSentence', 'explanation']
    };
    const prompt = `Generate a grammar challenge for a ${difficultyLevels[settings.difficulty]} English learner. Create a single sentence with one common, clear grammatical error. Provide the incorrect sentence, the corrected version, and a simple explanation for the correction.`;
    
    const response = await generateContent(prompt, schema);
    if (response) {
      try {
        const data = JSON.parse(response.text);
        setGrammarTask({ id: Date.now(), ...data });
      } catch (e) {
        setError("Could not generate a grammar challenge. Please try again.");
      }
    }
    setIsLoading(false);
  };

  const checkGrammarAnswer = () => {
    if (!grammarTask || !userCorrection) return;
    // Simple comparison, could be improved with more lenient checking
    const isCorrect = userCorrection.trim().toLowerCase().replace(/['".,]/g, '') === grammarTask.correctSentence.toLowerCase().replace(/['".,]/g, '');

    if (isCorrect) {
      setGrammarFeedback({ isCorrect: true, explanation: `Correct! ${grammarTask.explanation}` });
    } else {
      setGrammarFeedback({ isCorrect: false, explanation: `Not quite. The correct sentence is: "${grammarTask.correctSentence}". \n\n${grammarTask.explanation}` });
    }
  };

  // --- Idiom Quest ---
  const generateIdiomQuestTask = async () => {
    setIsLoading(true);
    setIdiomQuestTask(null);
    setIdiomQuestAnswer(null);

    const schema = {
        type: Type.OBJECT,
        properties: {
            contextSentence: { type: Type.STRING, description: "A sentence with a placeholder like '___' where the idiom should go." },
            correctIdiom: { type: Type.STRING, description: "The idiom that fits in the sentence." },
            options: {
                type: Type.ARRAY,
                description: "An array of 4 strings. One is the correct meaning of the idiom, and three are plausible distractors. The array should be shuffled.",
                items: { type: Type.STRING }
            },
            correctMeaning: { type: Type.STRING, description: "The correct meaning of the idiom." },
            explanation: { type: Type.STRING, description: "A simple explanation of what the idiom means." }
        },
        required: ['contextSentence', 'correctIdiom', 'options', 'correctMeaning', 'explanation']
    };
    const prompt = `Generate an idiom quest for a ${difficultyLevels[settings.difficulty]} English learner. Create a sentence with a blank (___) where a common idiom should go. Provide the correct idiom, its meaning, and three plausible but incorrect meanings as distractors in a shuffled array. Also provide a simple explanation for the idiom.`;
    
    const response = await generateContent(prompt, schema);
    if (response) {
      try {
        const data = JSON.parse(response.text);
        setIdiomQuestTask({ id: Date.now(), ...data });
      } catch (e) {
        setError("Could not generate an idiom quest. Please try again.");
      }
    }
    setIsLoading(false);
  };


  // --- Exam Functions ---
  const handleExamSettingChange = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => setExamSettings(prev => ({ ...prev, [key]: value }));
  
  const startExam = async () => {
    setIsLoading(true);
    setExamQuestions([]);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer('');
    setExamResults(null);

    const questionSchema = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.NUMBER },
        type: { type: Type.STRING, enum: ['mcq', 'writing', 'speaking', 'listening'] },
        text: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['id', 'type', 'text']
    };

    const schema = {
      type: Type.ARRAY,
      items: questionSchema,
    };

    const prompt = `Generate a ${examSettings.type} exam with ${examSettings.questions} questions for an English learner at the ${difficultyLevels[settings.difficulty]} level. For MCQ questions, provide 4 options. For writing, speaking, and listening, just provide the prompt/question text. Ensure question IDs are sequential starting from 1.`;
    const response = await generateContent(prompt, schema);

    if (response) {
      try {
        const questions = JSON.parse(response.text);
        setExamQuestions(questions);
        setExamState('in-progress');
      } catch (e) {
        console.error("Failed to parse exam questions:", e);
        setError("Failed to create the exam. Please try again.");
      }
    }
    setIsLoading(false);
  };

  const handleNextQuestion = () => {
    const newAnswer: UserAnswer = { questionId: examQuestions[currentQuestionIndex].id, answer: currentAnswer };
    const updatedAnswers = [...userAnswers.filter(a => a.questionId !== newAnswer.questionId), newAnswer];
    setUserAnswers(updatedAnswers);
    
    if (currentQuestionIndex < examQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        const nextQuestionAnswer = updatedAnswers.find(a => a.questionId === examQuestions[currentQuestionIndex + 1].id);
        setCurrentAnswer(nextQuestionAnswer?.answer || '');
    } else {
        gradeExam(updatedAnswers);
    }
  };

  const gradeExam = async (finalAnswers: UserAnswer[]) => {
    setIsLoading(true);
    setExamState('results');

    const resultSchema = {
      type: Type.OBJECT,
      properties: {
        overallScore: { type: Type.NUMBER },
        summary: { type: Type.STRING },
        feedback: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              questionId: { type: Type.NUMBER },
              questionText: { type: Type.STRING },
              userAnswer: { type: Type.STRING },
              isCorrect: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING },
            },
            required: ['questionId', 'questionText', 'userAnswer', 'isCorrect', 'feedback'],
          }
        }
      },
      required: ['overallScore', 'summary', 'feedback']
    };

    const prompt = `An English learner at the ${difficultyLevels[settings.difficulty]} level has completed an exam. Here are the questions and their answers. Please grade the exam and provide an overall score (out of 100), a summary, and feedback for each question.
    
    Questions: ${JSON.stringify(examQuestions)}
    User Answers: ${JSON.stringify(finalAnswers)}
    `;

    const response = await generateContent(prompt, resultSchema, personaInstructions[settings.persona]);

    if (response) {
      try {
        const results = JSON.parse(response.text);
        setExamResults(results);
      } catch (e) {
        console.error("Failed to parse exam results:", e);
        setError("Failed to grade the exam. Please try again later.");
        setExamState('setup');
      }
    } else {
        setError("Failed to grade the exam. Please try again later.");
        setExamState('setup');
    }
    setIsLoading(false);
  };

  // --- Learning Path Functions ---
    const handleFocusChange = (focus: PlanSetupOptions['focus']) => {
        setPlanSetupOptions(prev => ({ ...prev, focus }));
    };

    const handleActivityToggle = (activity: View) => {
        setPlanSetupOptions(prev => {
            const newActivities = prev.activities.includes(activity)
                ? prev.activities.filter(a => a !== activity)
                : [...prev.activities, activity];
            return { ...prev, activities: newActivities };
        });
    };

    const generateLearningPlan = async () => {
        setIsLoading(true);
        setError('');
        setLearningPlan(null);

        const learningPlanSchema = {
          type: Type.OBJECT,
          properties: {
            objective: { type: Type.STRING, description: "A brief, encouraging overall goal for the week for the user based on their chosen focus." },
            plan: {
              type: Type.ARRAY,
              description: "A 7-day plan, one entry per day, from Monday to Sunday.",
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING, description: "The day of the week (e.g., 'Monday')." },
                  tasks: {
                    type: Type.ARRAY,
                    description: "A list of 2-3 tasks for the day.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING, description: "A unique ID for the task, e.g., 'monday-task-1'."},
                        description: { type: Type.STRING, description: "A user-facing description of the task." },
                        type: { type: Type.STRING, enum: ['story', 'pronunciation', 'conversation', 'sentenceBuilder', 'grammarGauntlet', 'idiomQuest', 'languageTools', 'writingAnalysis', 'exams'], description: "The corresponding activity type in the app." }
                      },
                      required: ['id', 'description', 'type']
                    }
                  }
                },
                required: ['day', 'tasks']
              }
            }
          },
          required: ['objective', 'plan']
        };
        
        const focusMap = {
            integral: 'The plan should be balanced, covering various skills like reading, speaking, grammar, and vocabulary. The main objective for the week should be to improve overall English skills.',
            speaking: 'The main objective for the week is to improve conversational fluency, pronunciation, and listening skills. Focus on speaking and conversation activities.',
            writing: 'The main objective for the week is to improve writing accuracy, grammar, and style. Focus on writing and grammar activities.',
            vocabulary: 'The main objective for the week is to expand vocabulary with new words, idioms, and phrases. Focus on vocabulary, reading, and idiom activities.',
            exam: 'The main objective for the week is to prepare for an exam by practicing relevant skills. Include a mix of activities and a final exam-style challenge.'
        };

        let prompt = `Generate a 7-day personalized learning plan for an English learner at the ${difficultyLevels[settings.difficulty]} level. ${focusMap[planSetupOptions.focus]}`;

        if (planSetupOptions.activities.length > 0) {
            const activityNames = planSetupOptions.activities.map(act => viewNames[act]).join(', ');
            prompt += `\nPlease prioritize including the following user-preferred activities in the plan: ${activityNames}.`;
        }
        
        prompt += `\nPlease provide 2-3 specific, actionable tasks for each day from Monday to Sunday. The tasks should correspond to activities available in the app. Ensure task IDs are unique. Return the output as a JSON object following the provided schema.`;
        
        const response = await generateContent(prompt, learningPlanSchema);

        if (response) {
            try {
                const data = JSON.parse(response.text);
                const planWithCompletion = {
                    ...data,
                    plan: data.plan.map((day: DailyPlan) => ({
                        ...day,
                        tasks: day.tasks.map((task: LearningTask) => ({
                            ...task,
                            completed: false, // Initialize all tasks as not completed
                        })),
                    })),
                };
                setLearningPlan(planWithCompletion);
            } catch (e) {
                console.error("Failed to parse learning plan:", e);
                setError("Could not generate a learning plan. Please try again.");
            }
        }
        setIsLoading(false);
    };

    const handleCreateNewPlan = () => {
        setError('');
        setLearningPlan(null);
    };

    const handleToggleTaskCompletion = (dayIndex: number, taskIndex: number) => {
      if (!learningPlan) return;

      const newLearningPlan = JSON.parse(JSON.stringify(learningPlan)); // Deep copy
      newLearningPlan.plan[dayIndex].tasks[taskIndex].completed = !newLearningPlan.plan[dayIndex].tasks[taskIndex].completed;
      setLearningPlan(newLearningPlan);
    };


  // --- Render Functions ---
  const SkeletonLoader = ({ lines = 3, type = 'text' }: { lines?: number; type?: 'text' | 'card' | 'title' }) => (
    <div className={`skeleton-loader ${type}`}>
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton-line"></div>)}
    </div>
  );
  
  const RadialProgressBar = ({ score, size = 60, strokeWidth = 5, colorClass = 'primary' }: { score: number; size?: number; strokeWidth?: number; colorClass?: 'primary' | 'score' }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;

    let scoreColorClass = 'high';
    if (score < 50) scoreColorClass = 'low';
    else if (score < 75) scoreColorClass = 'medium';

    return (
        <div className={`radial-progress-bar ${colorClass === 'score' ? scoreColorClass : colorClass}`} style={{'--size': `${size}px`} as React.CSSProperties}>
            <svg height={size} width={size}>
                <circle
                    className="progress-ring-bg"
                    strokeWidth={strokeWidth}
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className="progress-ring-fg"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <span className="progress-text">{Math.round(score)}<small>%</small></span>
        </div>
    );
  };
  
  const CollapsibleSection = ({ title, children, icon, startOpen = false }: { title: string, children: React.ReactNode, icon?: string, startOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(startOpen);
    return (
      <div className={`collapsible-section ${isOpen ? 'is-open' : ''}`}>
        <button className="collapsible-header" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}>
          <div className="collapsible-title">
            {icon && <span className="material-symbols-outlined">{icon}</span>}
            <span>{title}</span>
          </div>
          <span className="material-symbols-outlined collapsible-chevron">expand_more</span>
        </button>
        {isOpen && 
            <div className="collapsible-content">
                {children}
            </div>
        }
      </div>
    );
  };

  const getPlanProgress = () => {
    if (!learningPlan || !learningPlan.plan) return { completed: 0, total: 0, percentage: 0 };
    const allTasks = learningPlan.plan.flatMap(day => day.tasks);
    const completedTasks = allTasks.filter(task => task.completed).length;
    const totalTasks = allTasks.length;
    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return { completed: completedTasks, total: totalTasks, percentage };
  };

  const getNextTask = () => {
      if (!learningPlan) return null;
      const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0
      const today = learningPlan.plan[todayIndex];
      if (today) {
          const nextTaskInToday = today.tasks.find(task => !task.completed);
          if (nextTaskInToday) return nextTaskInToday;
      }
      // If today is done or has no tasks, find the next task in the week
      return learningPlan.plan.flatMap(day => day.tasks).find(task => !task.completed);
  };

  const renderHome = () => {
    const planProgress = getPlanProgress();
    const nextTask = getNextTask();
    
    return (
      <div className="home-dashboard">
        <div className="home-header-banner">
            <h1>Welcome back, {user.name.split(' ')[0]}!</h1>
            <p>Ready to continue your English learning journey? Let's get started!</p>
        </div>

        <div className="dashboard-content-grid">
            <div className="start-here-card content-card">
                <span className="material-symbols-outlined card-icon">auto_awesome</span>
                {nextTask ? (
                    <>
                        <h3>Start Your Next Task</h3>
                        <p>Continue your learning path with this activity.</p>
                        <div className="next-task-info">
                            <span className="material-symbols-outlined task-icon">{viewIcons[nextTask.type]}</span>
                            <div className="task-details">
                                <h4>{viewNames[nextTask.type]}</h4>
                                <p>{nextTask.description}</p>
                            </div>
                        </div>
                        <button className="button button-large" onClick={() => changeView(nextTask.type)}>
                            <span className="material-symbols-outlined">play_arrow</span>
                            Let's Go
                        </button>
                    </>
                ) : learningPlan ? (
                     <>
                        <h3>All Tasks Completed!</h3>
                        <p>You've finished all tasks in your plan. Great job! Explore other activities or create a new plan.</p>
                        <button className="button button-large" onClick={() => changeView('learningPath')}>
                            <span className="material-symbols-outlined">celebration</span>
                            View My Plan
                        </button>
                    </>
                ) : (
                    <>
                        <h3>Create Your Learning Path</h3>
                        <p>Get a personalized, week-by-week plan to guide your English learning journey.</p>
                        <button className="button button-large" onClick={() => changeView('learningPath')}>
                            <span className="material-symbols-outlined">route</span>
                            Create a Plan
                        </button>
                    </>
                )}
            </div>

            <div className="dashboard-sidebar">
                <div className="info-card content-card">
                    <div className="info-card-header">
                        <span className="material-symbols-outlined">trending_up</span>
                        <h4>Weekly Progress</h4>
                    </div>
                    {learningPlan ? (
                        <>
                            <div className="progress-bar-container">
                                <div className="progress-bar" style={{ width: `${planProgress.percentage}%` }}></div>
                            </div>
                            <p className="progress-text">{planProgress.completed} of {planProgress.total} tasks completed ({planProgress.percentage}%)</p>
                        </>
                    ) : <p className="progress-text">Create a learning plan to track your progress!</p>}
                </div>
                <div className="info-card content-card">
                    <div className="info-card-header">
                         <span className="material-symbols-outlined">bookmark</span>
                        <h4>Today's Word</h4>
                    </div>
                    {wordOfTheDay ? (
                        <div className="word-of-the-day-small">
                            <strong>{wordOfTheDay.word}</strong>
                            <p>{wordOfTheDay.definition}</p>
                        </div>
                    ) : <SkeletonLoader lines={2} />}
                </div>
            </div>
        </div>

        <div className="quick-access-section">
            <h3>Quick Access</h3>
            <div className="quick-access-grid">
                 <div className="quick-access-button" onClick={() => changeView('pronunciation')}>
                    <span className="material-symbols-outlined">record_voice_over</span>
                    <p>Speaking Practice</p>
                </div>
                <div className="quick-access-button" onClick={() => changeView('conversation')}>
                    <span className="material-symbols-outlined">chat</span>
                    <p>AI Conversation</p>
                </div>
                <div className="quick-access-button" onClick={() => changeView('writingAnalysis')}>
                    <span className="material-symbols-outlined">edit_document</span>
                    <p>Writing Analysis</p>
                </div>
                <div className="quick-access-button" onClick={() => changeView('exams')}>
                    <span className="material-symbols-outlined">quiz</span>
                    <p>Exams</p>
                </div>
            </div>
        </div>
      </div>
    );
  };


  const renderStory = () => (
    <div className="content-card">
      {isLoading ? <SkeletonLoader lines={5} /> : (
        <>
          <div className="story-container">{story.text.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
          <div className="story-question">{story.question}</div>
          <form className="form-container" onSubmit={checkStoryAnswer}>
            <input type="text" className="answer-input" value={storyAnswer} onChange={e => setStoryAnswer(e.target.value)} placeholder="Type your answer here..." />
            <button className="button" type="submit" disabled={isSubmitting || !storyAnswer}>
              {isSubmitting ? 'Checking...' : 'Check Answer'}
            </button>
          </form>
          {isSubmitting && <div className="loader-container"><div className="loader small"></div></div>}
          {storyFeedback && <div className="ai-feedback">{storyFeedback}</div>}
        </>
      )}
    </div>
  );
  
  const renderSpeaking = () => {
    if (!isSpeechRecognitionSupported) {
        return (
            <div className="content-card">
                <div className="permission-denied-card">
                    <span className="material-symbols-outlined">mic_off</span>
                    <h3>Speech Recognition Not Supported</h3>
                    <p>Sorry, your browser doesn't support the technology needed for this feature.</p>
                    <p>For the best experience, please use a browser like Google Chrome or Microsoft Edge.</p>
                </div>
            </div>
        );
    }
    
    if (microphonePermission === 'denied') {
        return (
            <div className="content-card">
                <div className="permission-denied-card">
                    <span className="material-symbols-outlined">mic_off</span>
                    <h3>Microphone Access Blocked</h3>
                    <p>To use Speaking Practice, you must allow microphone access in your browser's site settings.</p>
                    <p>Please enable permission and <strong>refresh the page</strong>.</p>
                </div>
            </div>
        );
    }

    const speakText = (text: string) => {
        if (!synth) return;
        if (synth.speaking) {
            synth.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        synth.speak(utterance);
    };

    const getRecordingButtonState = () => {
        if (isRecording) return 'recording';
        if (isSubmitting) return 'processing';
        return 'idle';
    }

    return (
        <div className="speaking-practice-container">
            <div className="speaking-history" ref={chatContainerRef}>
                {isLoading && <SkeletonLoader lines={3} />}
                {speakingHistory.map((turn, index) => (
                    <div key={index} className={`speaking-turn ${turn.role}`}>
                        <div className="speaking-bubble">
                            {turn.text}
                        </div>
                        {turn.role === 'user' && turn.feedback && (
                            <div className="feedback-card">
                                <div className="feedback-header">
                                    <h4>Feedback Summary</h4>
                                    <RadialProgressBar score={turn.feedback.accuracyScore} size={50} strokeWidth={4} />
                                </div>
                                <div className="feedback-details">
                                    <CollapsibleSection title="Pronunciation Tips" icon="campaign">
                                        {turn.feedback.pronunciationTips.length > 0 ? (
                                            <ul>
                                                {turn.feedback.pronunciationTips.map((tip, i) => (
                                                    <li key={i}>
                                                        <strong>{tip.word}:</strong> {tip.tip}
                                                        <button onClick={() => speakText(tip.word)} className="speak-tip-button" aria-label={`Listen to ${tip.word}`}>
                                                            <span className="material-symbols-outlined">volume_up</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p>Great pronunciation!</p>}
                                    </CollapsibleSection>
                                    <CollapsibleSection title="Fluency & Grammar" icon="forum">
                                        <p>{turn.feedback.fluencyComment}</p>
                                        <p>{turn.feedback.grammarComment}</p>
                                    </CollapsibleSection>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {isSubmitting && speakingHistory[speakingHistory.length - 1]?.role === 'user' && (
                     <div className="speaking-turn ai">
                        <div className="speaking-bubble typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="speaking-input-area">
                <div className="transcript-preview">
                    {isRecording ? (transcript || "Listening...") : (isSubmitting ? "Processing..." : "Tap the mic to speak")}
                </div>
                <button 
                    onClick={handleSpeakingRecordToggle} 
                    className={`record-button-interactive ${getRecordingButtonState()}`}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                    disabled={(isSubmitting && !isRecording)}
                >
                    {getRecordingButtonState() === 'processing' 
                        ? <div className="loader small-white"></div>
                        : <span className="material-symbols-outlined">{isRecording ? 'stop' : 'mic'}</span>
                    }
                </button>
            </div>
        </div>
    );
  };
  
  const renderConversation = () => (
    <div className="content-card">
      {isLoading ? <SkeletonLoader lines={6} /> : (
        <>
          <div className="chat-container" ref={chatContainerRef}>
              {chatHistory.map((msg, index) => (
                  <div key={index} className={`chat-message ${msg.role}`}>
                      {msg.text}
                  </div>
              ))}
              {isSubmitting && <div className="chat-message model typing-indicator"><span></span><span></span><span></span></div>}
          </div>
          <form className="form-container" onSubmit={sendChatMessage}>
              <input type="text" className="answer-input" value={chatMessage} onChange={e => setChatMessage(e.target.value)} placeholder="Type your message..." />
              <button className="button" type="submit" disabled={isSubmitting || !chatMessage}>Send</button>
          </form>
        </>
      )}
    </div>
  );
  
  const renderWritingAnalysis = () => (
    <div className="content-card">
        <form onSubmit={analyzeWriting}>
            <textarea
                className="writing-input"
                value={writingInput}
                onChange={e => setWritingInput(e.target.value)}
                placeholder="Paste or write your English text here for analysis..."
            />
            <button className="button" type="submit" disabled={isSubmitting || !writingInput}>
                {isSubmitting ? 'Analyzing...' : 'Analyze Text'}
            </button>
        </form>
        {isSubmitting && <div className="loader-container"><div className="loader small"></div></div>}
        {writingFeedback && (
            <div className="structured-feedback">
                <CollapsibleSection title="Overall Feedback" icon="summarize" startOpen={true}>
                    <p>{writingFeedback.overall}</p>
                </CollapsibleSection>
                <CollapsibleSection title="Grammar" icon="task_alt">
                    <p>{writingFeedback.grammar}</p>
                </CollapsibleSection>
                <CollapsibleSection title="Style" icon="palette">
                    <p>{writingFeedback.style}</p>
                </CollapsibleSection>
                <CollapsibleSection title="Vocabulary" icon="sort_by_alpha">
                    <p>{writingFeedback.vocabulary}</p>
                </CollapsibleSection>
            </div>
        )}
    </div>
  );

  // --- Language Tools Content Panes ---
  const renderPhrasalVerbsContent = () => (
    <>
      {isLoading ? <SkeletonLoader lines={4} /> : (
          phrasalVerb &&
          <>
              <div className="single-item-card">
                  <h2>{phrasalVerb.verb}</h2>
                  <p>{phrasalVerb.definition}</p>
                  <em>e.g., "{phrasalVerb.example}"</em>
              </div>
              <div className="action-bar">
                  <button className="button" onClick={generatePhrasalVerb}>Next Verb</button>
              </div>
          </>
      )}
    </>
  );

  const renderDictionaryContent = () => (
    <>
      <form className="form-container" onSubmit={searchDictionary}>
        <input type="text" className="answer-input" value={dictionaryWord} onChange={e => setDictionaryWord(e.target.value)} placeholder="Enter a word..."/>
        <button className="button" type="submit" disabled={isSubmitting || !dictionaryWord}>Search</button>
      </form>
      {isSubmitting && <div className="loader-container"><div className="loader small"></div></div>}
      {dictionaryResult && (
        <div className="dictionary-result-card">
          <h3>{dictionaryResult.word}</h3>
          <span>({dictionaryResult.partOfSpeech})</span>
          <p>{dictionaryResult.definition}</p>
          <em>e.g., "{dictionaryResult.example}"</em>
        </div>
      )}
    </>
  );

  const renderVocabularyContent = () => (
    <>
      {isLoading ? <SkeletonLoader lines={10} /> : (
          <>
              <div className="vocabulary-list">
                  {vocabularyList.map((item, index) => (
                      <div key={index} className="vocabulary-item">
                          <h4>{item.word}</h4>
                          <p>{item.definition}</p>
                          <em>e.g., "{item.example}"</em>
                      </div>
                  ))}
              </div>
              <div className="action-bar">
                  <button className="button" onClick={generateVocabulary}>New List</button>
              </div>
          </>
      )}
    </>
  );

  const renderTranslationContent = () => (
    <>
      {isLoading ? <SkeletonLoader lines={4} /> : (
          <div className="translation-container">
              <p className="translation-prompt">Translate the following sentence into {settings.translationLanguage}:</p>
              <h3>"{translationTask.sentence}"</h3>
              <form className="form-container" onSubmit={checkTranslation}>
                  <textarea
                      className="answer-input"
                      value={userTranslation}
                      onChange={e => setUserTranslation(e.target.value)}
                      placeholder="Type your translation here..."
                  />
                  <button className="button" type="submit" disabled={isSubmitting || !userTranslation}>
                      {isSubmitting ? 'Checking...' : 'Check Translation'}
                  </button>
              </form>
              {isSubmitting && <div className="loader-container"><div className="loader small"></div></div>}
              {translationTask.feedback && <div className="ai-feedback">{translationTask.feedback}</div>}
              <div className="action-bar">
                <button className="button secondary" onClick={generateTranslationTask}>Next Task</button>
              </div>
          </div>
      )}
    </>
  );

  const renderCommonPhrasesContent = () => (
    <>
      {isLoading ? <SkeletonLoader lines={4} /> : (
          commonPhrase &&
          <>
              <div className="single-item-card">
                  <h2>{commonPhrase.phrase}</h2>
                  <p>{commonPhrase.meaning}</p>
                  <em>e.g., "{commonPhrase.example}"</em>
              </div>
              <div className="action-bar">
                  <button className="button" onClick={generateCommonPhrase}>Next Phrase</button>
              </div>
          </>
      )}
    </>
  );

  const renderLanguageTools = () => {
    const handleToolChange = (tool: LanguageTool) => {
      setActiveLanguageTool(tool);
      // Pre-fetch data for the selected tool if it's not already there
      if (tool === 'vocabulary' && vocabularyList.length === 0) {
          generateVocabulary();
      } else if (tool === 'translation' && !translationTask.sentence) {
          generateTranslationTask();
      } else if (tool === 'phrases' && !commonPhrase) {
          generateCommonPhrase();
      } else if (tool === 'phrasalVerbs' && !phrasalVerb) {
          generatePhrasalVerb();
      }
      // Dictionary doesn't need pre-fetching; it's user-driven.
    };

    return (
        <div className="content-card">
            <div className="tool-tabs">
                <button className={`tool-tab-button ${activeLanguageTool === 'vocabulary' ? 'active' : ''}`} onClick={() => handleToolChange('vocabulary')}>
                    <span className="material-symbols-outlined">school</span> Vocabulary
                </button>
                <button className={`tool-tab-button ${activeLanguageTool === 'dictionary' ? 'active' : ''}`} onClick={() => handleToolChange('dictionary')}>
                    <span className="material-symbols-outlined">menu_book</span> Dictionary
                </button>
                <button className={`tool-tab-button ${activeLanguageTool === 'translation' ? 'active' : ''}`} onClick={() => handleToolChange('translation')}>
                    <span className="material-symbols-outlined">translate</span> Translation
                </button>
                <button className={`tool-tab-button ${activeLanguageTool === 'phrases' ? 'active' : ''}`} onClick={() => handleToolChange('phrases')}>
                    <span className="material-symbols-outlined">format_quote</span> Common Phrases
                </button>
                <button className={`tool-tab-button ${activeLanguageTool === 'phrasalVerbs' ? 'active' : ''}`} onClick={() => handleToolChange('phrasalVerbs')}>
                    <span className="material-symbols-outlined">dynamic_form</span> Phrasal Verbs
                </button>
            </div>
            <div className="tool-content">
                {activeLanguageTool === 'vocabulary' && renderVocabularyContent()}
                {activeLanguageTool === 'dictionary' && renderDictionaryContent()}
                {activeLanguageTool === 'translation' && renderTranslationContent()}
                {activeLanguageTool === 'phrases' && renderCommonPhrasesContent()}
                {activeLanguageTool === 'phrasalVerbs' && renderPhrasalVerbsContent()}
            </div>
        </div>
    );
  };
  
  const renderSentenceBuilder = () => {
    const wordBankWords = sentenceTask ? sentenceTask.scrambled : [];
    
    if (isLoading) {
        return <div className="content-card"><SkeletonLoader lines={8} /></div>;
    }

    return (
      <div className="content-card">
        <div className="sentence-builder-container">
          <p className="activity-instructions">Click the words in the correct order to form a sentence.</p>
          
          <div className="user-sentence-area">
            {userSentence.length === 0 && !sentenceFeedback && <span className="placeholder-text">Build your sentence here...</span>}
            {userSentence.map((word, index) => (
              <button key={`${word}-${index}`} className="word-pill user-word" onClick={() => handleUserSentenceClick(word, index)} disabled={!!sentenceFeedback}>
                {word}
              </button>
            ))}
          </div>

          {sentenceFeedback && (
            <div className={`sentence-feedback ${sentenceFeedback.correct ? 'correct' : 'incorrect'}`}>
              <span className="material-symbols-outlined">{sentenceFeedback.correct ? 'check_circle' : 'cancel'}</span>
              {sentenceFeedback.message}
            </div>
          )}

          <div className="word-bank-area">
             {wordBankWords.map((word, index) => (
              <button key={`${word}-${index}`} className="word-pill word-bank-word" onClick={() => handleWordBankClick(word, index)} disabled={!!sentenceFeedback}>
                {word}
              </button>
            ))}
          </div>

          <div className="sentence-builder-actions">
            <button className="button secondary" onClick={resetSentence} disabled={!!sentenceFeedback}>Reset</button>
            {sentenceFeedback ? (
              <button className="button" onClick={generateSentenceTask}>New Sentence</button>
            ) : (
              <button className="button" onClick={checkSentence} disabled={userSentence.length === 0}>Check Answer</button>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  const renderGrammarGauntlet = () => {
    if (isLoading) {
        return <div className="content-card"><SkeletonLoader lines={6} /></div>;
    }

    return (
      <div className="content-card grammar-gauntlet-container">
        <p className="activity-instructions">Find and fix the grammatical error in the sentence below.</p>
        
        {grammarTask && (
            <div className="grammar-task-sentence">
                <p>{grammarTask.incorrectSentence}</p>
            </div>
        )}

        <div className="form-container" style={{flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <textarea
            className="answer-input"
            value={userCorrection}
            onChange={e => setUserCorrection(e.target.value)}
            placeholder="Type the corrected sentence here..."
            disabled={!!grammarFeedback}
          />

          {grammarFeedback ? (
            <button className="button" onClick={generateGrammarTask}>Next Challenge</button>
          ) : (
            <button className="button" onClick={checkGrammarAnswer} disabled={!userCorrection}>Check Answer</button>
          )}
        </div>
        
        {grammarFeedback && (
            <div className={`sentence-feedback ${grammarFeedback.isCorrect ? 'correct' : 'incorrect'}`}>
              <span className="material-symbols-outlined">{grammarFeedback.isCorrect ? 'check_circle' : 'cancel'}</span>
              <p style={{margin: 0, whiteSpace: 'pre-wrap'}}>{grammarFeedback.explanation}</p>
            </div>
          )}
      </div>
    );
  };
  
  const renderIdiomQuest = () => {
    if (isLoading) {
        return <div className="content-card"><SkeletonLoader lines={8} /></div>;
    }

    if (!idiomQuestTask) {
        // This can happen on first load before the task is generated
        return <div className="content-card"><p>Loading Idiom Quest...</p><SkeletonLoader lines={8} /></div>;
    }

    const handleOptionClick = (option: string) => {
        if (idiomQuestAnswer) return; // Don't allow changing answer
        setIdiomQuestAnswer(option);
    };

    return (
        <div className="content-card idiom-quest-container">
            <p className="activity-instructions">Choose the correct meaning for the blank in the sentence.</p>
            <div className="idiom-context-sentence">
                {idiomQuestTask.contextSentence.replace('___', '_____')}
            </div>
            <div className="idiom-options-grid">
                {idiomQuestTask.options.map((option, index) => {
                    const isCorrect = option === idiomQuestTask.correctMeaning;
                    const isSelected = option === idiomQuestAnswer;
                    let buttonClass = 'idiom-option-button';
                    if (idiomQuestAnswer) { // Feedback state
                        if (isCorrect) buttonClass += ' correct';
                        else if (isSelected) buttonClass += ' incorrect';
                        else buttonClass += ' disabled';
                    }
                    return (
                        <button
                            key={index}
                            className={buttonClass}
                            onClick={() => handleOptionClick(option)}
                            disabled={!!idiomQuestAnswer}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
            {idiomQuestAnswer && (
                <div className="idiom-feedback-area">
                    <h4>{idiomQuestAnswer === idiomQuestTask.correctMeaning ? 'Excellent!' : 'Not quite!'}</h4>
                    <p>The idiom is: <strong>"{idiomQuestTask.correctIdiom}"</strong></p>
                    <p>{idiomQuestTask.explanation}</p>
                    <button className="button" onClick={generateIdiomQuestTask}>Next Quest</button>
                </div>
            )}
        </div>
    );
  };


  const renderExams = () => {
    if (isLoading && examState !== 'results') {
      return <div className="content-card"><SkeletonLoader lines={8} /></div>;
    }

    if (examState === 'results') {
      if (!examResults || isLoading) {
        return (
          <div className="content-card">
            <h2>Grading...</h2>
            <p>Please wait while we grade your exam.</p>
            <div className="loader-container"><div className="loader"></div></div>
          </div>
        );
      }
      return (
        <div className="content-card">
          <h2>Exam Results</h2>
          <div className="results-summary">
            <div className="results-summary-score">
              <RadialProgressBar score={examResults.overallScore} size={150} strokeWidth={10} colorClass="score" />
              <div className="results-summary-text">
                  <h3>Overall Score</h3>
                  <p>{examResults.summary}</p>
              </div>
            </div>
          </div>
          <div className="results-breakdown">
            <h4>Detailed Feedback:</h4>
            {examResults.feedback.map(item => (
              <CollapsibleSection
                key={item.questionId}
                title={`Question: ${item.questionText.substring(0, 50)}...`}
                icon={item.isCorrect ? 'check_circle' : 'cancel'}
              >
                 <div className={`feedback-item ${item.isCorrect ? 'correct' : 'incorrect'}`}>
                    <div className="feedback-content">
                        <p><strong>Your Answer:</strong> {item.userAnswer}</p>
                        <p><strong>Feedback:</strong> {item.feedback}</p>
                    </div>
                </div>
              </CollapsibleSection>
            ))}
          </div>
          <button className="button" onClick={() => { setExamState('setup'); setExamResults(null); }}>Take Another Exam</button>
        </div>
      );
    }

    if (examState === 'in-progress') {
      if (!examQuestions.length) return <div className="content-card"><p>Loading questions...</p><SkeletonLoader /></div>;
      const question = examQuestions[currentQuestionIndex];
      return (
        <div className="content-card">
          <h3>Question {currentQuestionIndex + 1} of {examQuestions.length}</h3>
          <p className="exam-question-text">{question.text}</p>
          {question.type === 'mcq' && question.options && (
            <div className="mcq-options">
              {question.options.map(option => (
                <button
                  key={option}
                  className={`button option-button ${currentAnswer === option ? 'selected' : ''}`}
                  onClick={() => setCurrentAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {(question.type === 'writing' || question.type === 'speaking' || question.type === 'listening') && (
            <textarea
              className="answer-input large"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder={
                question.type === 'speaking' ? "Transcribe what you would say..." :
                question.type === 'listening' ? "Answer based on the audio prompt..." :
                "Write your answer here..."
              }
            />
          )}
          <button className="button" onClick={handleNextQuestion} disabled={!currentAnswer}>
            {currentQuestionIndex < examQuestions.length - 1 ? 'Next Question' : 'Finish & Grade Exam'}
          </button>
        </div>
      );
    }

    return (
      <div className="content-card exam-setup-container">
        <h2>Exam Setup</h2>
        <div className="setup-option-group">
          <label className="setting-label">Exam Type</label>
          <div className="option-buttons">
            <button className={`option-button ${examSettings.type === 'comprehensive' ? 'selected' : ''}`} onClick={() => handleExamSettingChange('type', 'comprehensive')}>Comprehensive</button>
            <button className={`option-button ${examSettings.type === 'reading_vocab' ? 'selected' : ''}`} onClick={() => handleExamSettingChange('type', 'reading_vocab')}>Reading & Vocab</button>
            <button className={`option-button ${examSettings.type === 'writing_grammar' ? 'selected' : ''}`} onClick={() => handleExamSettingChange('type', 'writing_grammar')}>Writing & Grammar</button>
            <button className={`option-button ${examSettings.type === 'listening_speaking' ? 'selected' : ''}`} onClick={() => handleExamSettingChange('type', 'listening_speaking')}>Listening & Speaking</button>
          </div>
        </div>
        <div className="setup-option-group">
          <label className="setting-label">Number of Questions</label>
          <div className="option-buttons">
            <button className={`option-button ${examSettings.questions === 5 ? 'selected' : ''}`} onClick={() => handleExamSettingChange('questions', 5)}>5</button>
            <button className={`option-button ${examSettings.questions === 10 ? 'selected' : ''}`} onClick={() => handleExamSettingChange('questions', 10)}>10</button>
            <button className={`option-button ${examSettings.questions === 15 ? 'selected' : ''}`} onClick={() => handleExamSettingChange('questions', 15)}>15</button>
          </div>
        </div>
        <button className="button" onClick={startExam} disabled={isLoading}>
          {isLoading ? 'Generating...' : 'Start Exam'}
        </button>
      </div>
    );
  };

  const renderLearningPath = () => {
    if (isLoading && !learningPlan) {
        return <div className="content-card"><SkeletonLoader lines={10} /></div>;
    }

    if (!learningPlan) {
        const focusOptions: { key: PlanSetupOptions['focus']; label: string }[] = [
            { key: 'integral', label: 'Integral (All skills)' },
            { key: 'speaking', label: 'Improve Speaking & Listening' },
            { key: 'writing', label: 'Boost Grammar & Writing' },
            { key: 'vocabulary', label: 'Expand Vocabulary' },
            { key: 'exam', label: 'Exam Preparation' },
        ];
        
        const activityOptions: View[] = ['story', 'pronunciation', 'conversation', 'writingAnalysis', 'sentenceBuilder', 'grammarGauntlet', 'idiomQuest', 'languageTools'];

        return (
            <div className="content-card learning-plan-setup">
                <div className="learning-path-welcome">
                    <span className="material-symbols-outlined">auto_awesome</span>
                    <h3>Create Your Custom Learning Plan</h3>
                    <p>Tell us what you want to focus on this week, and we'll create a personalized plan just for you.</p>
                </div>
                
                <div className="plan-setup-group">
                    <h4 className="setting-label">Main Focus</h4>
                    <p>Choose your primary goal for this week's plan.</p>
                    <div className="option-buttons">
                        {focusOptions.map(opt => (
                            <button
                                key={opt.key}
                                className={`option-button ${planSetupOptions.focus === opt.key ? 'selected' : ''}`}
                                onClick={() => handleFocusChange(opt.key)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="plan-setup-group">
                    <h4 className="setting-label">Preferred Activities (Optional)</h4>
                    <p>Select any activities you enjoy, and we'll try to include them more often.</p>
                    <div className="activity-selection-grid">
                        {activityOptions.map(activity => (
                             <div 
                                key={activity}
                                className={`activity-selection-card ${planSetupOptions.activities.includes(activity) ? 'selected' : ''}`}
                                onClick={() => handleActivityToggle(activity)}
                            >
                                <span className="material-symbols-outlined">{viewIcons[activity]}</span>
                                <h5>{viewNames[activity]}</h5>
                                <span className="custom-checkbox-indicator"></span>
                            </div>
                        ))}
                    </div>
                </div>
                
                <button className="button generate-plan-button" onClick={generateLearningPlan} disabled={isLoading}>
                    {isLoading ? 'Generating...' : 'Generate My Plan'}
                </button>
            </div>
        );
    }
    
    const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0, Sunday = 6

    return (
        <div className="learning-path-container">
            <div className="weekly-objective content-card">
                <div className="weekly-objective-header">
                  <h3>This Week's Objective</h3>
                  <button className="button secondary" onClick={handleCreateNewPlan} disabled={isLoading}>
                    <span className="material-symbols-outlined">refresh</span>
                    New Plan
                  </button>
                </div>
                <p>{learningPlan.objective}</p>
            </div>
            <div className="daily-plan-grid">
                {learningPlan.plan.map((day, dayIndex) => (
                    <div key={day.day} className={`day-card ${dayIndex === todayIndex ? 'current-day' : ''}`}>
                        <h4>{day.day}</h4>
                        <ul className="task-list">
                            {day.tasks.map((task, taskIndex) => (
                                <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                                    <label className="task-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={task.completed}
                                            onChange={() => handleToggleTaskCompletion(dayIndex, taskIndex)}
                                        />
                                        <span className="custom-checkbox"></span>
                                    </label>
                                    <div className="task-content">
                                        <span className="material-symbols-outlined task-icon">{viewIcons[task.type]}</span>
                                        <p className="task-description">{task.description}</p>
                                    </div>
                                    <div className="task-actions">
                                        <button className="button-small" onClick={() => changeView(task.type)}>
                                            Start
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
  };


  const renderContent = () => {
    switch(activeView) {
      case 'home': return renderHome();
      case 'story': return renderStory();
      case 'pronunciation': return renderSpeaking();
      case 'conversation': return renderConversation();
      case 'languageTools': return renderLanguageTools();
      case 'sentenceBuilder': return renderSentenceBuilder();
      case 'grammarGauntlet': return renderGrammarGauntlet();
      case 'idiomQuest': return renderIdiomQuest();
      case 'exams': return renderExams();
      case 'writingAnalysis': return renderWritingAnalysis();
      case 'learningPath': return renderLearningPath();
      default: return <div className="content-card"><h2>{viewNames[activeView]}</h2><p>Content for this section is under construction.</p></div>;
    }
  };

  const SettingsContent = () => (
    <div className="settings-modal-content">
      <div className="setting-group">
        <label className="setting-label">Difficulty</label>
        <div className="control-group">
          {Object.keys(difficultyLevels).map(level => (
            <button key={level} className={`control-button ${settings.difficulty === level ? 'active' : ''}`} onClick={() => handleSettingChange('difficulty', level as Difficulty)}>
              {difficultyLevels[level as Difficulty]}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-group">
        <label className="setting-label">Tutor Persona</label>
        <div className="control-group">
          {Object.keys(personaTypes).map(type => (
            <button key={type} className={`control-button ${settings.persona === type ? 'active' : ''}`} onClick={() => handleSettingChange('persona', type as Persona)}>
              {personaTypes[type as Persona]}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-group">
        <label className="setting-label">Theme</label>
        <div className="control-group">
          {(Object.keys(themeOptions) as Theme[]).map(theme => (
             <button key={theme} title={themeOptions[theme].name} className={`control-button ${settings.theme === theme ? 'active' : ''}`} onClick={() => handleSettingChange('theme', theme)}>
              <span className="material-symbols-outlined">{themeOptions[theme].icon}</span>
            </button>
          ))}
        </div>
      </div>
       <div className="setting-group">
        <label className="setting-label">Font Size</label>
        <div className="control-group">
          {(Object.keys(fontSizes) as FontSize[]).map(size => (
            <button key={size} className={`control-button ${settings.fontSize === size ? 'active' : ''}`} onClick={() => handleSettingChange('fontSize', size)}>
              {fontSizes[size]}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-group">
        <label className="setting-label" htmlFor="translation-language-select">Translate To</label>
        <select id="translation-language-select" className="control-select" value={settings.translationLanguage} onChange={(e) => handleSettingChange('translationLanguage', e.target.value)}>
          {translationLanguages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
        </select>
      </div>
      <div className="setting-group-divider"></div>
      <div className="setting-group toggle-group">
        <div className="setting-label-group">
          <label className="setting-label" htmlFor="incognito-toggle">Incognito Mode</label>
          <p className="setting-description">When enabled, your activity and results will not be saved.</p>
        </div>
        <label className="toggle-switch">
          <input 
            id="incognito-toggle"
            type="checkbox" 
            checked={settings.isIncognito} 
            onChange={e => handleSettingChange('isIncognito', e.target.checked)} 
          />
          <span className="slider round"></span>
        </label>
      </div>
    </div>
  );

  const Navigation = ({ isSidebarExpanded, onLogout }: { isSidebarExpanded: boolean; onLogout: () => void; }) => {
    return (
      <nav 
        className={`sidebar-nav ${isSidebarExpanded ? 'is-open' : ''}`}
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <div className="nav-header">
          <span className="material-symbols-outlined logo-icon">language</span>
          <span className="nav-header-text">LingoSphere</span>
        </div>
        <ul className="nav-menu">
            {navGroups.map(group => (
                <React.Fragment key={group.title}>
                    {group.title !== 'Main' && <li className="nav-group-title"><span>{group.title}</span></li>}
                    {group.items.map(viewKey => (
                         <li key={viewKey} className={`nav-item ${activeView === viewKey ? 'active' : ''}`} onClick={() => changeView(viewKey)}>
                            <span className="material-symbols-outlined">{viewIcons[viewKey]}</span>
                            <span className="nav-item-text">{viewNames[viewKey]}</span>
                        </li>
                    ))}
                </React.Fragment>
            ))}
        </ul>
        <div className="nav-footer">
          {settings.isIncognito && (
            <div className="nav-item incognito-indicator">
              <span className="material-symbols-outlined">privacy_tip</span>
              <span className="nav-item-text">Incognito Active</span>
            </div>
          )}
          <div className="nav-item" onClick={() => setIsSettingsModalOpen(true)}>
             <span className="material-symbols-outlined">settings</span>
             <span className="nav-item-text">Settings</span>
          </div>
          <div className="nav-item" onClick={onLogout}>
             <span className="material-symbols-outlined">logout</span>
             <span className="nav-item-text">Logout</span>
          </div>
        </div>
      </nav>
    )
  };

  const TranslationPopup = () => {
    if (!popup.original) return null;
    return (
      <div className="translation-popup" style={{ top: `${popup.y}px`, left: `${popup.x}px` }}>
        {popup.loading ? <div className="loader small-popup"></div> : (
          <p><strong>{popup.original}</strong>: {popup.text}</p>
        )}
      </div>
    );
  };
  
  if (!isStateLoaded) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
      </div>
    );
  }

  const PageTitle = () => {
    if (activeView === 'home') {
        return <h2 className="page-title">Dashboard</h2>;
    }
    return <h2 className="page-title">{viewNames[activeView]}</h2>;
  }

  return (
    <div className={`app-layout ${isSidebarExpanded ? 'sidebar-expanded' : ''}`}>
      <div className="mobile-header">
        <button className="menu-toggle" onClick={() => setIsSidebarExpanded(true)} aria-label="Open navigation menu">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h2 className="mobile-header-title">
          {settings.isIncognito && <span className="material-symbols-outlined incognito-icon-header" title="Incognito Mode Active">privacy_tip</span>}
          {viewNames[activeView]}
        </h2>
        <button className="settings-toggle" onClick={() => setIsSettingsModalOpen(true)} aria-label="Open settings">
            <span className="material-symbols-outlined">settings</span>
        </button>
      </div>
      {isSidebarExpanded && <div className="nav-backdrop" onClick={() => setIsSidebarExpanded(false)} />}
      <Navigation isSidebarExpanded={isSidebarExpanded} onLogout={onLogout} />
      <main className="main-content" ref={mainContentRef} key={viewKey}>
        <div className="main-content-inner">
          {settings.isIncognito && activeView !== 'home' && (
            <div className="incognito-banner">
              <span className="material-symbols-outlined">privacy_tip</span>
              <p>Incognito Mode is on. Your activity and results will not be saved.</p>
            </div>
          )}
          {activeView !== 'home' && <PageTitle />}
          {error && <p className="error-message">{error}</p>}
          {renderContent()}
        </div>
      </main>
      <TranslationPopup />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)}>
        <SettingsContent />
      </SettingsModal>
    </div>
  );
};

// --- Authentication Components ---

const GoogleAuthModal = ({ isOpen, onClose, onAccountSelect }: { isOpen: boolean; onClose: () => void; onAccountSelect: (user: { name: string; email: string }) => void; }) => {
  if (!isOpen) return null;
  const [showOtherAccountInput, setShowOtherAccountInput] = useState(false);
  const [otherAccountEmail, setOtherAccountEmail] = useState('');

  const mockAccounts = [
    { name: 'Alex Doe', email: 'alex.doe@example.com', icon: 'person' },
    { name: 'Jane Smith', email: 'jane.smith@example.com', icon: 'person' }
  ];

  const handleOtherAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otherAccountEmail) {
      const name = otherAccountEmail.split('@')[0]
        .replace(/[\._]/g, ' ')
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      onAccountSelect({ name: name || 'User', email: otherAccountEmail });
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="google-auth-modal" onClick={e => e.stopPropagation()}>
        <div className="auth-header">
           <span className="material-symbols-outlined logo-icon">language</span>
           <h3>Choose an account</h3>
        </div>
        <p>to continue to LingoSphere AI</p>

        {!showOtherAccountInput ? (
          <ul className="google-account-list">
            {mockAccounts.map(account => (
              <li key={account.email} onClick={() => onAccountSelect(account)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onAccountSelect(account)}>
                <span className="material-symbols-outlined account-icon">{account.icon}</span>
                <div className="account-details">
                  <strong>{account.name}</strong>
                  <span>{account.email}</span>
                </div>
              </li>
            ))}
            <li onClick={() => setShowOtherAccountInput(true)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setShowOtherAccountInput(true)}>
               <span className="material-symbols-outlined account-icon">person_add</span>
               <div className="account-details">
                  <strong>Use another account</strong>
               </div>
            </li>
          </ul>
        ) : (
          <form onSubmit={handleOtherAccountSubmit} className="other-account-form">
            <input 
              type="email" 
              placeholder="Email or phone"
              value={otherAccountEmail}
              onChange={e => setOtherAccountEmail(e.target.value)}
              required
              autoFocus
            />
            <div className="other-account-actions">
              <button type="button" className="button text" onClick={() => setShowOtherAccountInput(false)}>Back</button>
              <button type="submit" className="button">Next</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    modalRoot
  );
};


const AuthPage = ({ onLoginSuccess }: { onLoginSuccess: (user: User) => void }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleAuthModalOpen, setIsGoogleAuthModalOpen] = useState(false);

  // Simulated User DB
  const getUsers = () => {
    try {
      const users = localStorage.getItem('lingosphere-users');
      return users ? JSON.parse(users) : [];
    } catch (e) {
      return [];
    }
  };

  const saveUsers = (users: any[]) => {
    localStorage.setItem('lingosphere-users', JSON.stringify(users));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    // Simulate network delay
    setTimeout(() => {
      if (isLoginView) {
        handleLogin();
      } else {
        handleSignup();
      }
    }, 500);
  };

  const handleLogin = () => {
    const users = getUsers();
    const user = users.find((u: any) => u.email === email && u.password === password);
    if (user) {
      onLoginSuccess({ name: user.name, email: user.email });
    } else {
      setError('Invalid email or password.');
      setIsLoading(false);
    }
  };

  const handleSignup = () => {
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      setIsLoading(false);
      return;
    }
    const users = getUsers();
    if (users.some((u: any) => u.email === email)) {
      setError('An account with this email already exists.');
      setIsLoading(false);
      return;
    }
    const newUser = { name, email, password };
    saveUsers([...users, newUser]);
    onLoginSuccess({ name: newUser.name, email: newUser.email });
  };

  const handleSelectGoogleAccount = (selectedUser: { name: string, email: string }) => {
    setIsLoading(true);
    setIsGoogleAuthModalOpen(false);
    // Simulate API call
    setTimeout(() => {
      const users = getUsers();
      let user = users.find((u: any) => u.email === selectedUser.email);
      if (!user) {
          user = { ...selectedUser, password: 'google-provided' };
          saveUsers([...users, user]);
      }
      onLoginSuccess({ name: user.name, email: user.email });
    }, 500);
  };

  return (
    <div className="auth-container">
       <div className="auth-bg">
            <div className="auth-bg-shape shape1"></div>
            <div className="auth-bg-shape shape2"></div>
            <div className="auth-bg-shape shape3"></div>
            <div className="auth-bg-shape shape4"></div>
        </div>
      <div className="auth-card">
        <div className="auth-header">
          <span className="material-symbols-outlined logo-icon">language</span>
          <h1>LingoSphere AI</h1>
        </div>
        <h2>{isLoginView ? 'Welcome Back' : 'Create Your Account'}</h2>
        <p>{isLoginView ? 'Log in to continue your learning journey.' : 'Start learning English with us today.'}</p>
        
        <button className="button google-btn" onClick={() => setIsGoogleAuthModalOpen(true)} disabled={isLoading}>
          <svg viewBox="0 0 18 18" width="18" height="18" style={{ marginRight: '12px' }}>
            <g>
                <path fill="#4285F4" d="M17.64,9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2082,1.125-.8427,2.0782-1.7964,2.7218v2.2582h2.9082C16.6582,15.7564,17.64,12.7,17.64,9.2045z"></path>
                <path fill="#34A853" d="M9,18c2.43,0,4.4673-.8064,5.9564-2.1818l-2.9082-2.2582c-.8064,.5409-1.8364,.8618-2.9945,.8618-2.34,0-4.3255-1.5836-5.0355-3.71L.96,13.09C2.4336,15.9836,5.4818,18,9,18z"></path>
                <path fill="#FBBC05" d="M3.9645,10.71c-.18-.5409-.2836-1.1164-.2836-1.71s.1036-1.1691,.2836-1.71V5.0318H.96C.3436,6.1736,0,7.5473,0,9s.3436,2.8264,.96,3.9682L3.9645,10.71z"></path>
                <path fill="#EA4335" d="M9,3.5455c1.3218,0,2.5082,.4555,3.4409,1.3455l2.5818-2.5818C13.4636,.8255,11.43,0,9,0,5.4818,0,2.4336,2.0164,.96,4.91L3.9645,7.29C4.6745,5.1636,6.66,3.5455,9,3.5455z"></path>
            </g>
          </svg>
            Sign in with Google
        </button>

        <div className="auth-divider">
            <span>OR</span>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <p className="error-message">{error}</p>}
          {!isLoginView && (
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" required />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          <button className="button auth-button" type="submit" disabled={isLoading}>
            {isLoading ? <div className="loader small-white"></div> : (isLoginView ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="auth-toggle">
          {isLoginView ? "Don't have an account?" : "Already have an account?"}
          <button onClick={() => { setIsLoginView(!isLoginView); setError(''); }}>
            {isLoginView ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
       <GoogleAuthModal 
         isOpen={isGoogleAuthModalOpen}
         onClose={() => setIsGoogleAuthModalOpen(false)}
         onAccountSelect={handleSelectGoogleAccount}
       />
    </div>
  );
};

const AppContainer = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('lingosphere-current-user');
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      localStorage.removeItem('lingosphere-current-user');
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = (user: User) => {
    localStorage.setItem('lingosphere-current-user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('lingosphere-current-user');
    setCurrentUser(null);
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <App user={currentUser} onLogout={handleLogout} />;
};


const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<AppContainer />);