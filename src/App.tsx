/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Send, 
  Sparkles, 
  BarChart3, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  ChevronRight,
  MessageSquare,
  Users,
  Target,
  FileText,
  X,
  ArrowRight,
  Info,
  Layers,
  ChevronDown,
  LayoutDashboard,
  BookOpen,
  Newspaper,
  Calendar,
  Settings,
  Bell,
  Search,
  Plus,
  Clock,
  Smile,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  Type,
  List,
  ListChecks,
  Check,
  ListOrdered,
  Code,
  Quote,
  Camera,
  Image as ImageIcon,
  FileUp,
  BarChart2,
  Trash2,
  MessageCircle,
  Library,
  Layout,
  Award,
  Timer,
  Menu,
  Eye,
  Edit3,
  Rocket,
  GraduationCap,
  ClipboardList,
  Video,
  ShoppingBag,
  Cake,
  Network,
  UserCircle,
  File as FileIcon
} from 'lucide-react';
import { 
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeContent, draftFromBrief, analyzeHistoricalPerformance, analyzeSelectedPosts, type AnalysisResult, type HistoricalAnalysisResult } from './services/geminiService';
import { getHumandContext, calculateReach, getUserPosts, type HumandGroup, type HumandSegmentation, type UserPermissions, type UserPost } from './services/humandService';
import { fetchFeedPosts, fetchMultipleUserProfiles, fetchTemporalPatterns, fetchTopSegments, fetchUserPostsFromDb, fetchPostMetricsAggregate, fetchPostMetrics, fetchCommentSentiment, type FeedPost, type DbUserProfile, type DbPost, type PostMetricsAggregate, type PostMetric, type SentimentDistribution } from './services/supabaseService';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SEGMENTS = ["Frontline Staff", "Corporate Office", "Middle Management", "New Hires"];
const TONES = ["Inspirational", "Direct & Clear", "Empathetic", "Formal/Compliance"];
const SWITCHABLE_USER_IDS = [669499, 3440301, 512460];

const MOCK_HISTORICAL_METRICS = {
  totalReach: 15420,
  uniqueViews: 8900,
  totalReactions: 1240,
  totalComments: 450,
  totalShares: 85,
  engagementRate: "14.5%",
  topPerformingDays: ["Tuesday", "Thursday"],
  audienceEngagement: {
    "Frontline Staff": "12%",
    "Corporate Office": "18%",
    "Middle Management": "15%"
  },
  sentiment: {
    positive: 65,
    neutral: 25,
    negative: 10
  }
};

export default function App() {
  const [content, setContent] = useState('');
  const [isLabsOpen, setIsLabsOpen] = useState(false);
  const [currentLabsTab, setCurrentLabsTab] = useState<'check' | 'intelligence'>('check');
  const [selectedDimension, setSelectedDimension] = useState('Feed');
  const [selectedAudience, setSelectedAudience] = useState('All organization');
  const [historicalAnalysis, setHistoricalAnalysis] = useState<HistoricalAnalysisResult | null>(null);
  const [isAnalyzingHistory, setIsAnalyzingHistory] = useState(false);
  const [intelligenceMode, setIntelligenceMode] = useState<'aggregated' | 'selection'>('aggregated');
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [isAnalyzingSelected, setIsAnalyzingSelected] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      LinkExtension.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Write something...',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none text-lg leading-relaxed min-h-[300px] prose prose-slate max-w-none',
      },
    },
  });

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    if (editor) {
      editor.chain().focus().insertContent(emojiData.emoji).run();
    }
    setShowEmojiPicker(false);
  };
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedTone, setSelectedTone] = useState(TONES[0]);

  // New state for Humand dimensions
  const [postDimension, setPostDimension] = useState<'Feed' | 'Group'>('Feed');
  const [humandContext, setHumandContext] = useState<UserPermissions | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [isSegmentationDropdownOpen, setIsSegmentationDropdownOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [currentView, setCurrentView] = useState<'Labs' | 'Feed' | 'Groups' | 'Intelligence'>('Labs');
  const [isAudienceModalOpen, setIsAudienceModalOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<{ name: string; content?: string } | null>(null);
  const [poll, setPoll] = useState<{ question: string; options: string[] } | null>(null);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [labsSubView, setLabsSubView] = useState<'editor' | 'intelligence'>('editor');
  const [intelligencePosts, setIntelligencePosts] = useState<any[]>([]);
  const [intelligenceMetrics, setIntelligenceMetrics] = useState<any>(null);
  const [intelligencePerPostMetrics, setIntelligencePerPostMetrics] = useState<any[]>([]);
  const [intelligenceSentiment, setIntelligenceSentiment] = useState<SentimentDistribution | null>(null);
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false);
  const [intDimensionFilter, setIntDimensionFilter] = useState<'feed' | 'group'>('feed');
  const [intGroupFilter, setIntGroupFilter] = useState<string>('');
  const [intSegFilter, setIntSegFilter] = useState<string>('');
  const [selSearchQuery, setSelSearchQuery] = useState('');
  const [selGroupFilter, setSelGroupFilter] = useState<string>('');
  const [selDateFrom, setSelDateFrom] = useState('');
  const [selDateTo, setSelDateTo] = useState('');
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<DbUserProfile[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const userMenuRef = useRef<HTMLDivElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  const segmentationRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const docInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (segmentationRef.current && !segmentationRef.current.contains(event.target as Node)) {
        setIsSegmentationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load switchable user profiles on mount
  useEffect(() => {
    fetchMultipleUserProfiles(SWITCHABLE_USER_IDS).then(users => {
      setAvailableUsers(users);
      if (users.length > 0) {
        setActiveUserId(users[0].id);
      }
    });
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function handleUserMenuClick(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleUserMenuClick);
    return () => document.removeEventListener('mousedown', handleUserMenuClick);
  }, []);

  // Load context whenever activeUserId changes
  useEffect(() => {
    const loadContext = async () => {
      setIsLoadingContext(true);
      try {
        const context = await getHumandContext(activeUserId || undefined);
        setHumandContext(context);
        setSelectedSegmentIds([]);
        setActiveGroupId(null);
        if (context.availableGroups.length > 0) {
          setSelectedGroupId(context.availableGroups[0].id);
        }
      } catch (error) {
        console.error("Failed to load Humand context:", error);
      } finally {
        setIsLoadingContext(false);
      }
    };
    loadContext();
  }, [activeUserId]);

  useEffect(() => {
    const loadPosts = async () => {
      const posts = await getUserPosts();
      setUserPosts(posts);
    };
    loadPosts();
  }, []);

  useEffect(() => {
    if (currentView === 'Feed') {
      setIsLoadingFeed(true);
      fetchFeedPosts(15).then(posts => {
        setFeedPosts(posts);
      }).catch(err => {
        console.error('Failed to load feed posts:', err);
      }).finally(() => {
        setIsLoadingFeed(false);
      });
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'Intelligence' && intelligenceMode === 'aggregated') {
      handleAnalyzeHistory();
    }
  }, [currentView, intelligenceMode, selectedDimension, selectedAudience]);

  const handleLabsClick = async () => {
    if (!content.trim()) return;
    setIsLabsOpen(true);
    setIsAnalyzing(true);
    setCurrentLabsTab('check');
    
    // Determine target audience for analysis with AND/OR logic
    let targetAudience: string[] = [];
    if (postDimension === 'Group') {
      targetAudience = [humandContext?.availableGroups.find(g => g.id === selectedGroupId)?.name || "Group Members"];
    } else if (selectedSegmentIds.length > 0) {
      // Group selected items by their segmentation
      const groupedSegments: { [key: string]: string[] } = {};
      
      selectedSegmentIds.forEach(id => {
        for (const s of humandContext?.availableSegmentations || []) {
          const item = s.items.find(i => i.id === id);
          if (item) {
            if (!groupedSegments[s.name]) groupedSegments[s.name] = [];
            groupedSegments[s.name].push(item.name);
            break;
          }
        }
      });

      // Format as: (Location: London OR Reykjavík) AND (Position: Director)
      const audienceStrings = Object.entries(groupedSegments).map(([sName, items]) => {
        if (items.length === 1) return `${sName}: ${items[0]}`;
        return `(${sName}: ${items.join(" OR ")})`;
      });

      targetAudience = [audienceStrings.join(" AND ")];
    } else {
      targetAudience = ["All the organization"];
    }

    try {
      const instanceId = humandContext?.userProfile?.instanceId || 1;
      const [temporalData, topSegments] = await Promise.all([
        fetchTemporalPatterns(instanceId),
        fetchTopSegments(instanceId, 5),
      ]);

      const result = await analyzeContent(
        content,
        selectedTone,
        targetAudience,
        selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined,
        humandContext?.userProfile,
        poll || undefined,
        selectedDocument || undefined,
        temporalData,
        topSegments
      );
      setAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeHistory = async () => {
    setIsAnalyzingHistory(true);
    try {
      const result = await analyzeHistoricalPerformance(
        selectedDimension, 
        selectedAudience, 
        MOCK_HISTORICAL_METRICS,
        humandContext?.userProfile?.instanceId || 1
      );
      setHistoricalAnalysis(result);
    } catch (error) {
      console.error('Historical analysis failed:', error);
    } finally {
      setIsAnalyzingHistory(false);
    }
  };

  const handleAnalyzeSelected = async () => {
    if (selectedPostIds.length === 0) return;
    setIsAnalyzingSelected(true);
    try {
      const selectedPosts = userPosts.filter(p => selectedPostIds.includes(p.id));
      const result = await analyzeSelectedPosts(
        selectedPosts,
        humandContext?.userProfile?.instanceId || 1
      );
      setHistoricalAnalysis(result);
    } catch (error) {
      console.error('Selected posts analysis failed:', error);
    } finally {
      setIsAnalyzingSelected(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const toggleSegment = (id: string) => {
    setSelectedSegmentIds(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const applyRewrite = (newContent: string) => {
    if (editor) {
      editor.commands.setContent(newContent);
    }
    setContent(newContent);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setSelectedImage({
          data: base64String,
          mimeType: file.type,
          preview: URL.createObjectURL(file)
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (event) => {
          setSelectedDocument({
            name: file.name,
            content: event.target?.result as string
          });
        };
        reader.readAsText(file);
      } else {
        // For other types, we'll just use a more descriptive placeholder for now
        // In a real app, we'd use a library to extract text from PDF/DOCX
        setSelectedDocument({
          name: file.name,
          content: `[File: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes]. This is a non-text file. The AI will analyze the metadata and provide general insights based on the file name and type.`
        });
      }
    }
  };

  const removeDoc = () => {
    setSelectedDocument(null);
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const applyFormatting = (type: string) => {
    if (!editor) return;
    
    switch (type) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'link': {
        const url = window.prompt('URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
        break;
      }
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break;
      case 'bullet': editor.chain().focus().toggleBulletList().run(); break;
      case 'ordered': editor.chain().focus().toggleOrderedList().run(); break;
      case 'code': editor.chain().focus().toggleCode().run(); break;
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break;
    }
  };

  const currentReach = useMemo(() => {
    if (!humandContext) return 0;
    return calculateReach(
      postDimension,
      selectedGroupId,
      selectedSegmentIds,
      humandContext.availableGroups,
      humandContext.availableSegmentations
    );
  }, [postDimension, selectedGroupId, selectedSegmentIds, humandContext]);

  return (
    <>
      <div className="min-h-screen bg-humand-gray-bg text-humand-text-primary font-sans flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-humand-gray-border flex flex-col shrink-0 hidden md:flex">
        <div className="h-16 px-6 border-b border-humand-gray-border flex items-center gap-4">
          <Menu className="text-humand-text-secondary cursor-pointer" size={24} />
          <div className="w-10 h-10 bg-humand-navy rounded-full flex items-center justify-center text-white font-bold text-lg">
            hu
          </div>
        </div>
        
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavItem
            icon={<Sparkles size={20} />}
            label="Humand Comm Labs"
            active={currentView === 'Labs'}
            onClick={() => setCurrentView('Labs')}
          />
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label="Feed" 
            active={currentView === 'Feed'}
            onClick={() => {
              setCurrentView('Feed');
              setPostDimension('Feed');
            }}
          />
          <NavItem 
            icon={<Users size={20} />} 
            label="Groups" 
            active={currentView === 'Groups'}
            onClick={() => {
              setCurrentView('Groups');
              setPostDimension('Group');
              if (!activeGroupId && humandContext?.availableGroups.length) {
                setActiveGroupId(humandContext.availableGroups[0].id);
                setSelectedGroupId(humandContext.availableGroups[0].id);
              }
            }}
          />
          <NavItem icon={<BookOpen size={20} />} label="Magazine" />
          <NavItem icon={<MessageCircle size={20} />} label="Chats" badge={1} />
          <NavItem icon={<Library size={20} />} label="Knowledge libraries" />
          <NavItem icon={<Calendar size={20} />} label="Events" />
          <NavItem icon={<Layout size={20} />} label="Service portal" />
          <NavItem icon={<Award size={20} />} label="Kudos" />
          <NavItem icon={<FileText size={20} />} label="Forms and Tasks" />
          <NavItem icon={<Clock size={20} />} label="Shifts" />
          <NavItem icon={<Timer size={20} />} label="Time tracking" />
          <NavItem icon={<Calendar size={20} />} label="Time off" hasSubmenu />
          <NavItem icon={<Rocket size={20} />} label="Onboarding" />
          <NavItem icon={<Target size={20} />} label="Goals and OKRs" />
          <NavItem icon={<GraduationCap size={20} />} label="Learning" />
          <NavItem icon={<ClipboardList size={20} />} label="Surveys" />
          <NavItem icon={<Video size={20} />} label="Live Streaming" />
          <NavItem icon={<ShoppingBag size={20} />} label="Marketplace" />
          <NavItem icon={<Cake size={20} />} label="Birthdays & Anniversaries" />
          <NavItem icon={<Network size={20} />} label="Org Chart" />
          <NavItem icon={<Link size={20} />} label="Quick Links" />
          <NavItem icon={<FileIcon size={20} />} label="Files" />
          <NavItem icon={<UserCircle size={20} />} label="Digital Employee File" />
          <NavItem icon={<BarChart3 size={20} />} label="Insights" />
        </nav>
        
        <div className="p-4 border-t border-humand-gray-border">
          <NavItem icon={<Settings size={20} />} label="Settings" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-humand-gray-border px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-humand-text-secondary" size={16} />
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="w-full bg-humand-gray-bg border-none rounded-full pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-humand-text-secondary hover:bg-humand-gray-bg rounded-full transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="relative" ref={userMenuRef}>
              <button
                ref={avatarBtnRef}
                onClick={() => {
                  if (!isUserMenuOpen && avatarBtnRef.current) {
                    const rect = avatarBtnRef.current.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  }
                  setIsUserMenuOpen(!isUserMenuOpen);
                }}
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-humand-blue/20 hover:border-humand-blue transition-colors focus:outline-none"
              >
                {humandContext?.userProfile?.profilePicture ? (
                  <img src={humandContext.userProfile.profilePicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-humand-blue/10 flex items-center justify-center text-humand-blue font-bold text-xs">
                    {humandContext?.userProfile?.name?.split(' ').map(n => n[0]).join('') || 'ME'}
                  </div>
                )}
              </button>
              {isUserMenuOpen && (
                <div className="fixed w-64 bg-white rounded-xl shadow-xl border border-humand-gray-border z-50 py-2 overflow-hidden" style={{ top: menuPos.top, right: menuPos.right }}>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest">Switch User</div>
                  {availableUsers.map(user => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setActiveUserId(user.id);
                        setIsUserMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-humand-gray-bg transition-colors text-left",
                        activeUserId === user.id && "bg-humand-blue/5"
                      )}
                    >
                      <img src={user.profile_picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-humand-navy truncate">{user.first_name} {user.last_name}</p>
                        <p className="text-[10px] text-humand-text-secondary truncate">ID: {user.id}</p>
                      </div>
                      {activeUserId === user.id && <Check size={16} className="text-humand-blue ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
              {/* Content Viewport */}
        <div className="flex-1 flex overflow-hidden bg-humand-gray-bg relative">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {currentView === 'Intelligence' && (
              <div className="max-w-6xl mx-auto p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <div>
                    <h1 className="text-2xl font-bold text-humand-navy">Personal Content Intelligence</h1>
                    <p className="text-humand-text-secondary text-sm">Analyze historical performance across your posts.</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-8 bg-white p-1 rounded-2xl border border-humand-gray-border w-fit shrink-0">
                  <button 
                    onClick={() => setIntelligenceMode('aggregated')}
                    className={clsx(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                      intelligenceMode === 'aggregated' ? "bg-humand-blue text-white shadow-md shadow-humand-blue/20" : "text-humand-text-secondary hover:bg-humand-gray-bg"
                    )}
                  >
                    Aggregated Insights
                  </button>
                  <button 
                    onClick={() => setIntelligenceMode('selection')}
                    className={clsx(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                      intelligenceMode === 'selection' ? "bg-humand-blue text-white shadow-md shadow-humand-blue/20" : "text-humand-text-secondary hover:bg-humand-gray-bg"
                    )}
                  >
                    Selection Analysis
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
                  {intelligenceMode === 'aggregated' ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-humand-gray-border p-8 space-y-8">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-humand-blue/5 rounded-2xl flex items-center justify-center text-humand-blue">
                          <BarChart3 size={24} />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-humand-navy">View Insights By</h2>
                          <p className="text-sm text-humand-text-secondary">Choose a space and audience to see how your content is performing.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Dimension</label>
                          <div className="relative">
                            <select 
                              value={selectedDimension}
                              onChange={(e) => setSelectedDimension(e.target.value)}
                              className="w-full appearance-none bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-10 font-bold text-humand-navy"
                            >
                              <option value="Feed">Feed</option>
                              <option value="Groups">Groups</option>
                              <option value="Magazine">Magazine</option>
                              <option value="All">All Spaces</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-humand-text-secondary pointer-events-none" size={16} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Audience Segmentation</label>
                          <div className="relative">
                            <select 
                              value={selectedAudience}
                              onChange={(e) => setSelectedAudience(e.target.value)}
                              className="w-full appearance-none bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-10 font-bold text-humand-navy"
                            >
                              <option value="All organization">All organization</option>
                              <option value="Frontline Staff">Frontline Staff</option>
                              <option value="Corporate Office">Corporate Office</option>
                              <option value="Middle Management">Middle Management</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-humand-text-secondary pointer-events-none" size={16} />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button 
                          onClick={handleAnalyzeHistory}
                          disabled={isAnalyzingHistory}
                          className="flex items-center gap-2 bg-humand-blue text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-humand-blue/20 disabled:opacity-50"
                        >
                          {isAnalyzingHistory ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              Generate Insights
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-humand-gray-border p-8 space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-humand-blue/5 rounded-2xl flex items-center justify-center text-humand-blue">
                            <ListChecks size={24} />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-humand-navy">Select Posts to Analyze</h2>
                            <p className="text-sm text-humand-text-secondary">Choose specific posts to analyze as a cohesive series or topic.</p>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-humand-blue bg-humand-blue/5 px-4 py-2 rounded-full">
                          {selectedPostIds.length} posts selected
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {userPosts.map(post => (
                          <div 
                            key={post.id}
                            onClick={() => {
                              setSelectedPostIds(prev => 
                                prev.includes(post.id) ? prev.filter(id => id !== post.id) : [...prev, post.id]
                              );
                            }}
                            className={clsx(
                              "p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4",
                              selectedPostIds.includes(post.id) ? "border-humand-blue bg-humand-blue/5" : "border-humand-gray-border hover:border-humand-blue/50"
                            )}
                          >
                            <div className={clsx(
                              "w-6 h-6 rounded-md border flex items-center justify-center transition-all",
                              selectedPostIds.includes(post.id) ? "bg-humand-blue border-humand-blue text-white" : "border-humand-gray-border bg-white"
                            )}>
                              {selectedPostIds.includes(post.id) && <Check size={14} />}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-sm font-bold text-humand-navy line-clamp-1">{post.title}</h3>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-humand-text-secondary uppercase tracking-wider">{post.date}</span>
                                <span className="text-[10px] bg-humand-gray-bg px-2 py-0.5 rounded text-humand-text-secondary">{post.dimension}</span>
                                <span className="text-[10px] flex items-center gap-1 text-humand-blue font-bold">
                                  <Users size={10} /> {post.reach.toLocaleString()} reach
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button 
                          onClick={handleAnalyzeSelected}
                          disabled={isAnalyzingSelected || selectedPostIds.length === 0}
                          className="flex items-center gap-2 bg-humand-blue text-white px-8 py-3 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-humand-blue/20 disabled:opacity-50"
                        >
                          {isAnalyzingSelected ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Analyzing Selection...
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              Analyze Selected Posts
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Historical Insights Content */}
                  {historicalAnalysis ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
                      <div className="space-y-8">
                        {/* Performance Summary */}
                        <section className="bg-white rounded-2xl p-8 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                            <LayoutDashboard size={14} className="text-humand-blue" />
                            Performance Summary
                          </h3>
                          <div className="prose prose-sm max-w-none text-humand-text-primary leading-relaxed">
                            {historicalAnalysis.performanceSummary}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 pt-4">
                            <div className="bg-humand-gray-bg rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold uppercase text-humand-text-secondary mb-1">Total Reach</p>
                              <p className="text-lg font-black text-humand-navy">{MOCK_HISTORICAL_METRICS.totalReach.toLocaleString()}</p>
                            </div>
                            <div className="bg-humand-gray-bg rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold uppercase text-humand-text-secondary mb-1">Engagement</p>
                              <p className="text-lg font-black text-humand-navy">{MOCK_HISTORICAL_METRICS.engagementRate}</p>
                            </div>
                            <div className="bg-humand-gray-bg rounded-xl p-3 text-center">
                              <p className="text-[9px] font-bold uppercase text-humand-text-secondary mb-1">Sentiment</p>
                              <p className="text-lg font-black text-green-600">{MOCK_HISTORICAL_METRICS.sentiment.positive}%</p>
                            </div>
                          </div>
                        </section>

                        {/* Key Patterns */}
                        <section className="bg-white rounded-2xl p-8 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                            <Sparkles size={14} className="text-humand-blue" />
                            Key Patterns & Insights
                          </h3>
                          <div className="prose prose-sm max-w-none text-humand-text-primary leading-relaxed">
                            {historicalAnalysis.keyPatterns}
                          </div>
                        </section>

                        {/* Audience Insights */}
                        <section className="bg-white rounded-2xl p-8 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                            <Users size={14} className="text-humand-blue" />
                            Audience Insights
                          </h3>
                          <div className="prose prose-sm max-w-none text-humand-text-primary leading-relaxed">
                            {historicalAnalysis.audienceInsights}
                          </div>
                          
                          <div className="h-48 mt-6">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(MOCK_HISTORICAL_METRICS.audienceEngagement).map(([name, value]) => ({ name, value: parseInt(value) }))}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                                <YAxis fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} unit="%" />
                                <Tooltip 
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                  cursor={{ fill: '#f8fafc' }}
                                />
                                <Bar dataKey="value" fill="#0046ff" radius={[4, 4, 0, 0]} barSize={40} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                      </div>

                      <div className="space-y-8">
                        {/* Trend Analysis */}
                        <section className="bg-white rounded-2xl p-8 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                            <BarChart3 size={14} className="text-humand-blue" />
                            Trend Analysis
                          </h3>
                          <div className="prose prose-sm max-w-none text-humand-text-primary leading-relaxed">
                            {historicalAnalysis.trendAnalysis}
                          </div>
                        </section>

                        {/* Recommendations */}
                        <section className="bg-humand-navy rounded-3xl p-8 text-white space-y-6 shadow-xl shadow-humand-navy/20">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                              <Target size={20} className="text-humand-blue" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-widest">Strategic Recommendations</h3>
                              <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider">Forward-Looking Actions</p>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            {historicalAnalysis.recommendations.map((rec, i) => (
                              <div key={i} className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all group">
                                <div className="w-6 h-6 rounded-full bg-humand-blue/20 text-humand-blue flex items-center justify-center shrink-0 font-black text-[10px]">
                                  {i + 1}
                                </div>
                                <p className="text-sm font-medium leading-relaxed group-hover:translate-x-1 transition-transform">
                                  {rec}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* Sentiment Distribution */}
                        <section className="bg-white rounded-2xl p-8 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                            <Smile size={14} className="text-humand-blue" />
                            Sentiment Distribution
                          </h3>
                          <div className="flex items-center h-6 rounded-full overflow-hidden bg-humand-gray-bg">
                            <div className="bg-green-500 h-full rounded-l-full" style={{ width: `${MOCK_HISTORICAL_METRICS.sentiment.positive}%` }} />
                            <div className="bg-yellow-400 h-full" style={{ width: `${MOCK_HISTORICAL_METRICS.sentiment.neutral}%` }} />
                            <div className="bg-red-500 h-full rounded-r-full" style={{ width: `${MOCK_HISTORICAL_METRICS.sentiment.negative}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest">
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /> Positive {MOCK_HISTORICAL_METRICS.sentiment.positive}%</span>
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400" /> Neutral {MOCK_HISTORICAL_METRICS.sentiment.neutral}%</span>
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Negative {MOCK_HISTORICAL_METRICS.sentiment.negative}%</span>
                          </div>
                        </section>
                      </div>
                    </div>
                  ) : !isAnalyzingHistory && (
                    <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-2xl border border-dashed border-humand-gray-border">
                      <div className="w-16 h-16 bg-humand-gray-bg rounded-full flex items-center justify-center text-humand-text-secondary">
                        <BarChart3 size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-humand-navy">No analysis generated yet</p>
                        <p className="text-sm text-humand-text-secondary">Select your filters and click "Generate Insights" to start.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentView === 'Labs' && (
              <div className="max-w-6xl mx-auto p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-humand-navy flex items-center gap-2">
                      <Sparkles size={24} className="text-humand-blue" />
                      Humand Comm Labs
                    </h1>
                    <p className="text-humand-text-secondary text-sm">Draft and optimize your communications with AI-powered insights.</p>
                  </div>
                </div>
                {/* Post Editor - hidden, Content Intelligence is the main view */}
                {false && (
                <div>

                <div className="grid grid-cols-1 gap-8">
                  {/* Main Column */}
                  <div className="space-y-8">
                    {/* Post Configuration */}
                    <div className="bg-white rounded-2xl shadow-sm border border-humand-gray-border p-8 space-y-8">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-humand-blue/5 rounded-2xl flex items-center justify-center text-humand-blue">
                          <Layers size={24} />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-humand-navy">Post Configuration</h2>
                          <p className="text-sm text-humand-text-secondary">Define where, to whom, and in what tone this post will be visible.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Dimension</label>
                          <div className="relative">
                            <select 
                              value={postDimension}
                              onChange={(e) => setPostDimension(e.target.value as 'Feed' | 'Group')}
                              className="w-full appearance-none bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-10 font-bold text-humand-navy"
                            >
                              <option value="Feed">Feed Post</option>
                              <option value="Group">Group Post</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-humand-text-secondary pointer-events-none" size={16} />
                          </div>
                        </div>

                        <AnimatePresence mode="wait">
                          {postDimension === 'Group' ? (
                            <motion.div 
                              key="group-select"
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="space-y-2"
                            >
                              <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Target Group</label>
                              <div className="relative">
                                <select 
                                  value={selectedGroupId}
                                  onChange={(e) => setSelectedGroupId(e.target.value)}
                                  disabled={isLoadingContext}
                                  className="w-full appearance-none bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-10 disabled:opacity-50 font-bold text-humand-navy"
                                >
                                  {isLoadingContext ? (
                                    <option>Loading groups...</option>
                                  ) : (
                                    humandContext?.availableGroups.map(g => (
                                      <option key={g.id} value={g.id}>{g.name} ({g.memberCount} members)</option>
                                    ))
                                  )}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-humand-text-secondary pointer-events-none" size={16} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div 
                              key="feed-select"
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="space-y-2"
                            >
                              <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Audience Segmentation</label>
                              <div className="relative" ref={segmentationRef}>
                                <button 
                                  type="button"
                                  onClick={() => setIsSegmentationDropdownOpen(!isSegmentationDropdownOpen)}
                                  disabled={isLoadingContext || !humandContext?.canCreateSegmentedPosts}
                                  className="w-full flex items-center justify-between bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-4 disabled:opacity-50 font-bold text-humand-navy"
                                >
                                  <span className="truncate">
                                    {selectedSegmentIds.length === 0 
                                      ? "All the organization" 
                                      : `${selectedSegmentIds.length} segments selected`}
                                  </span>
                                  <ChevronDown className={cn("text-humand-text-secondary transition-transform shrink-0 ml-2", isSegmentationDropdownOpen && "rotate-180")} size={16} />
                                </button>
                                
                                <AnimatePresence>
                                  {isSegmentationDropdownOpen && (
                                    <motion.div 
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: 10 }}
                                      className="absolute z-30 mt-2 w-[320px] bg-white border border-humand-gray-border rounded-2xl shadow-2xl overflow-hidden"
                                    >
                                      <div className="p-4 border-b border-humand-gray-border bg-humand-gray-bg/30 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-humand-text-secondary">Select Audience</span>
                                        <button 
                                          onClick={() => setSelectedSegmentIds([])}
                                          className="text-[10px] font-bold text-humand-blue hover:underline"
                                        >
                                          Reset to All
                                        </button>
                                      </div>
                                      <div className="max-h-[320px] overflow-y-auto">
                                        {humandContext?.availableSegmentations.map(s => (
                                          <div key={s.id} className="border-b border-humand-gray-border last:border-0">
                                            <button 
                                              type="button"
                                              onClick={() => toggleSection(s.id)}
                                              className="w-full px-5 py-4 flex items-center justify-between hover:bg-humand-gray-bg/50 transition-colors"
                                            >
                                              <span className="text-sm font-bold text-humand-navy">
                                                Select {s.name} ({s.items.filter(i => selectedSegmentIds.includes(i.id)).length}/{s.items.length})
                                              </span>
                                              <ChevronDown className={cn("text-humand-text-secondary transition-transform", expandedSections.includes(s.id) && "rotate-180")} size={14} />
                                            </button>
                                            <AnimatePresence>
                                              {expandedSections.includes(s.id) && (
                                                <motion.div 
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  className="overflow-hidden bg-white"
                                                >
                                                  <div className="px-5 pb-4 space-y-3">
                                                    {s.items.map(item => (
                                                      <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                                                        <div className="relative flex items-center">
                                                          <input 
                                                            type="checkbox"
                                                            checked={selectedSegmentIds.includes(item.id)}
                                                            onChange={() => toggleSegment(item.id)}
                                                            className="peer appearance-none w-5 h-5 border-2 border-humand-gray-border rounded-md checked:bg-humand-blue checked:border-humand-blue transition-all"
                                                          />
                                                          <CheckCircle2 className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" size={14} style={{ left: '3px' }} />
                                                        </div>
                                                        <span className="text-sm font-medium text-humand-text-secondary group-hover:text-humand-navy transition-colors">{item.name}</span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="p-4 bg-humand-gray-bg/30 border-t border-humand-gray-border flex justify-end">
                                        <button 
                                          type="button"
                                          onClick={() => setIsSegmentationDropdownOpen(false)}
                                          className="bg-humand-navy text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all"
                                        >
                                          Apply Selection
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Target Tone</label>
                          <div className="relative">
                            <select 
                              value={selectedTone}
                              onChange={(e) => setSelectedTone(e.target.value)}
                              className="w-full appearance-none bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none pr-10 font-bold text-humand-navy"
                            >
                              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-humand-text-secondary pointer-events-none" size={16} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Editor Card - Humand Composer Style */}
                    <div className="bg-white rounded-3xl shadow-sm border border-humand-gray-border overflow-hidden">
                      {/* Composer Header */}
                      <div className="px-8 py-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {humandContext?.userProfile?.profilePicture ? (
                            <img src={humandContext.userProfile.profilePicture} alt="" className="w-12 h-12 rounded-full object-cover" />
                          ) : (
                            <div className="w-12 h-12 bg-orange-700 rounded-full flex items-center justify-center text-white font-bold text-lg">
                              {humandContext?.userProfile?.name?.split(' ').map(n => n[0]).join('') || 'ME'}
                            </div>
                          )}
                          <div className="space-y-1">
                            <h3 className="font-bold text-humand-navy leading-none">{humandContext?.userProfile?.name || 'Mayra Ebenau'}</h3>
                            <div className="inline-flex items-center px-3 py-1 bg-humand-blue/5 text-humand-blue rounded-full text-[10px] font-bold border border-humand-blue/10">
                              {selectedSegmentIds.length === 0 
                                ? "All the organization" 
                                : `${selectedSegmentIds.length} segments selected`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex bg-humand-gray-bg p-1 rounded-xl border border-humand-gray-border">
                            <button 
                              onClick={() => setEditorMode('edit')}
                              className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                editorMode === 'edit' ? "bg-white text-humand-blue shadow-sm" : "text-humand-text-secondary hover:text-humand-navy"
                              )}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => setEditorMode('preview')}
                              className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                editorMode === 'preview' ? "bg-white text-humand-blue shadow-sm" : "text-humand-text-secondary hover:text-humand-navy"
                              )}
                            >
                              Preview
                            </button>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-2 text-humand-navy font-bold">
                              <Users size={18} />
                              <span>Reach: {currentReach.toLocaleString()}</span>
                            </div>
                            <span className="text-[10px] text-humand-text-secondary font-medium mt-1">0 / 100 MB</span>
                          </div>
                        </div>
                      </div>

                      {/* Composer Toolbar */}
                      <AnimatePresence mode="wait">
                        {editorMode === 'edit' && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-8 py-3 border-y border-humand-gray-border flex items-center justify-between bg-white overflow-hidden"
                          >
                            <div className="flex items-center gap-1">
                              <div className="relative" ref={emojiPickerRef}>
                                <ToolbarButton icon={<Smile size={18} />} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                                {showEmojiPicker && (
                                  <div className="absolute top-full left-0 z-50 mt-2">
                                    <EmojiPicker onEmojiClick={onEmojiClick} />
                                  </div>
                                )}
                              </div>
                              <div className="w-px h-4 bg-humand-gray-border mx-1" />
                              <ToolbarButton 
                                icon={<Bold size={18} />} 
                                onClick={() => applyFormatting('bold')} 
                                active={editor?.isActive('bold')}
                              />
                              <ToolbarButton 
                                icon={<Italic size={18} />} 
                                onClick={() => applyFormatting('italic')} 
                                active={editor?.isActive('italic')}
                              />
                              <ToolbarButton 
                                icon={<Underline size={18} />} 
                                onClick={() => applyFormatting('underline')} 
                                active={editor?.isActive('underline')}
                              />
                              <ToolbarButton 
                                icon={<Strikethrough size={18} />} 
                                onClick={() => applyFormatting('strike')} 
                                active={editor?.isActive('strike')}
                              />
                              <div className="w-px h-4 bg-humand-gray-border mx-1" />
                              <ToolbarButton 
                                icon={<Link size={18} />} 
                                onClick={() => applyFormatting('link')} 
                                active={editor?.isActive('link')}
                              />
                              <ToolbarButton 
                                icon={<Type size={18} />} 
                                onClick={() => applyFormatting('h3')} 
                                active={editor?.isActive('heading', { level: 3 })}
                              />
                              <div className="w-px h-4 bg-humand-gray-border mx-1" />
                              <ToolbarButton 
                                icon={<List size={18} />} 
                                onClick={() => applyFormatting('bullet')} 
                                active={editor?.isActive('bulletList')}
                              />
                              <ToolbarButton 
                                icon={<ListOrdered size={18} />} 
                                onClick={() => applyFormatting('ordered')} 
                                active={editor?.isActive('orderedList')}
                              />
                              <div className="w-px h-4 bg-humand-gray-border mx-1" />
                              <ToolbarButton 
                                icon={<Code size={18} />} 
                                onClick={() => applyFormatting('code')} 
                                active={editor?.isActive('code')}
                              />
                              <ToolbarButton 
                                icon={<Quote size={18} />} 
                                onClick={() => applyFormatting('quote')} 
                                active={editor?.isActive('blockquote')}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Composer Editor */}
                      <div className="relative px-8 py-6">
                        {editorMode === 'edit' ? (
                          <EditorContent editor={editor} />
                        ) : (
                          <div className="prose prose-slate max-w-none min-h-[300px]">
                            <div dangerouslySetInnerHTML={{ __html: content || '<p className="text-humand-text-secondary italic">No content yet...</p>' }} />
                            
                            {poll && (
                              <div className="mt-8 p-6 bg-humand-gray-bg rounded-2xl border border-humand-gray-border">
                                <h4 className="text-humand-navy font-bold mb-4 flex items-center gap-2">
                                  <BarChart2 size={18} className="text-humand-blue" />
                                  {poll.question}
                                </h4>
                                <div className="space-y-3">
                                  {poll.options.map((opt, i) => (
                                    <div key={i} className="bg-white p-3 rounded-xl border border-humand-gray-border text-sm font-medium text-humand-navy">
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-6 flex flex-wrap gap-4">
                          {selectedImage && (
                            <div className="relative inline-block group">
                              <img 
                                src={selectedImage.preview} 
                                alt="Selected" 
                                className="max-h-48 rounded-xl border border-humand-gray-border shadow-sm"
                              />
                              <button 
                                onClick={removeImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}

                          {selectedDocument && (
                            <div className="relative group bg-humand-gray-bg border border-humand-gray-border rounded-xl p-4 flex items-center gap-3 min-w-[200px]">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-humand-blue shadow-sm">
                                <FileText size={20} />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-humand-navy truncate max-w-[150px]">{selectedDocument.name}</p>
                                <p className="text-[10px] text-humand-text-secondary">Document Attachment</p>
                              </div>
                              <button 
                                onClick={removeDoc}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}

                          {poll && (
                            <div className="relative group bg-humand-blue/5 border border-humand-blue/10 rounded-xl p-4 min-w-[240px]">
                              <div className="flex items-center gap-2 mb-3">
                                <BarChart2 size={16} className="text-humand-blue" />
                                <span className="text-xs font-bold text-humand-blue uppercase tracking-widest">Poll</span>
                              </div>
                              <p className="text-sm font-bold text-humand-navy mb-2">{poll.question}</p>
                              <div className="space-y-1">
                                {poll.options.map((opt, idx) => (
                                  <div key={idx} className="text-[10px] bg-white px-2 py-1 rounded border border-humand-blue/10 text-humand-text-secondary">
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              <button 
                                onClick={() => setPoll(null)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Composer Footer */}
                      <div className="px-8 py-4 border-t border-humand-gray-border flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            accept="image/*" 
                            className="hidden" 
                          />
                          <input 
                            type="file" 
                            ref={docInputRef} 
                            onChange={handleDocUpload} 
                            accept=".pdf,.doc,.docx,.txt" 
                            className="hidden" 
                          />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 hover:bg-humand-gray-bg rounded-lg text-humand-text-secondary transition-colors"
                            title="Upload Image"
                          >
                            <Camera size={20} />
                          </button>
                          <button className="p-2 hover:bg-humand-gray-bg rounded-lg text-humand-text-secondary transition-colors font-black text-xs">
                            GIF
                          </button>
                          <button 
                            onClick={() => docInputRef.current?.click()}
                            className="p-2 hover:bg-humand-gray-bg rounded-lg text-humand-text-secondary transition-colors"
                            title="Upload Document"
                          >
                            <FileUp size={20} />
                          </button>
                          <button 
                            onClick={() => setIsPollModalOpen(true)}
                            className="p-2 hover:bg-humand-gray-bg rounded-lg text-humand-text-secondary transition-colors"
                            title="Create Poll"
                          >
                            <BarChart2 size={20} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleLabsClick}
                            disabled={!content.trim() && !selectedImage && !poll && !selectedDocument}
                            className={cn(
                              "flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all shadow-lg",
                              (content.trim() || selectedImage || poll || selectedDocument)
                                ? "bg-humand-blue text-white hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-humand-blue/20" 
                                : "bg-humand-gray-border text-humand-text-secondary cursor-not-allowed shadow-none"
                            )}
                          >
                            <Sparkles size={14} />
                            Labs Check
                          </button>
                          <button className="px-8 py-2 bg-humand-navy text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-humand-navy/20">
                            Post
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                )}

                {true && (
                  <div className="space-y-6">
                    {/* Mode Toggle */}
                    <div className="flex gap-1 bg-humand-gray-bg rounded-xl p-1">
                      <button onClick={() => setIntelligenceMode('aggregated')} className={cn("flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all", intelligenceMode === 'aggregated' ? "bg-white text-humand-navy shadow-sm" : "text-humand-text-secondary")}>
                        Aggregated Insights
                      </button>
                      <button onClick={() => setIntelligenceMode('selection')} className={cn("flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all", intelligenceMode === 'selection' ? "bg-white text-humand-navy shadow-sm" : "text-humand-text-secondary")}>
                        Selection Analysis
                      </button>
                    </div>

                    {intelligenceMode === 'aggregated' ? (
                      <div className="space-y-6">
                        {/* Filters */}
                        <div className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary">View Insights By</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">Dimension</label>
                              <select value={intDimensionFilter} onChange={e => { setIntDimensionFilter(e.target.value as any); setIntGroupFilter(''); setIntSegFilter(''); }} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy">
                                <option value="feed">Feed</option>
                                <option value="group">Groups</option>
                              </select>
                            </div>
                            <div>
                              {intDimensionFilter === 'feed' ? (
                                <>
                                  <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">Audience Segmentation</label>
                                  <select value={intSegFilter} onChange={e => setIntSegFilter(e.target.value)} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy">
                                    <option value="">All the organization</option>
                                    {humandContext?.availableSegmentations.map(s => (
                                      <optgroup key={s.id} label={s.name}>
                                        {s.items.map(item => (
                                          <option key={item.id} value={item.id}>{item.name}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <>
                                  <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">Group</label>
                                  <select value={intGroupFilter} onChange={e => setIntGroupFilter(e.target.value)} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy">
                                    <option value="">All Groups</option>
                                    {humandContext?.availableGroups.map(g => (
                                      <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                  </select>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!activeUserId) return;
                              setIsLoadingIntelligence(true);
                              try {
                                const posts = await fetchUserPostsFromDb(activeUserId, {
                                  type: intDimensionFilter,
                                  groupId: intGroupFilter ? Number(intGroupFilter) : undefined,
                                });
                                setIntelligencePosts(posts);
                                const postIds = posts.map(p => p.id);
                                const [metrics, perPost, sentiment] = await Promise.all([
                                  fetchPostMetricsAggregate(postIds),
                                  fetchPostMetrics(postIds),
                                  fetchCommentSentiment(postIds),
                                ]);
                                setIntelligenceMetrics(metrics);
                                setIntelligencePerPostMetrics(perPost);
                                setIntelligenceSentiment(sentiment);
                              } catch (err) {
                                console.error('Failed to load intelligence data:', err);
                              } finally {
                                setIsLoadingIntelligence(false);
                              }
                            }}
                            disabled={isLoadingIntelligence}
                            className="w-full bg-humand-navy text-white rounded-xl py-3 text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {isLoadingIntelligence ? <RefreshCw size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                            Generate Insights
                          </button>
                        </div>

                        {/* Results */}
                        {isLoadingIntelligence ? (
                          <div className="flex items-center justify-center py-20">
                            <RefreshCw size={24} className="animate-spin text-humand-blue" />
                          </div>
                        ) : intelligenceMetrics ? (
                          <div className="space-y-6">
                            {/* Metric Cards */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Unique Seen By</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_unique_viewers).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">People Who Commented</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_comments).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">People Who Reacted</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_reactions).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Total Seen By</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_views).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Avg Engagement Rate</p>
                                <p className="text-3xl font-black text-humand-navy">{(Number(intelligenceMetrics.avg_engagement_rate) * 100).toFixed(1)}%</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Top Emoji</p>
                                <p className="text-3xl font-black text-humand-navy">{intelligenceMetrics.top_emoji || '—'}</p>
                              </div>
                            </div>

                            {/* Engagement Over Time Chart */}
                            {intelligencePerPostMetrics.length > 0 && (
                              <div className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-4 flex items-center gap-2">
                                  <BarChart3 size={14} className="text-humand-blue" />
                                  Engagement Over Time
                                </h3>
                                <div className="h-64">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={intelligencePerPostMetrics.map((m: PostMetric, i: number) => ({
                                      name: `Post ${i + 1}`,
                                      Views: m.view_count,
                                      Reactions: m.reaction_count,
                                      Comments: m.comment_count,
                                    }))}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                      <YAxis tick={{ fontSize: 10 }} />
                                      <Tooltip />
                                      <Legend />
                                      <Line type="monotone" dataKey="Views" stroke="#0046FF" strokeWidth={2} dot={{ r: 4 }} />
                                      <Line type="monotone" dataKey="Reactions" stroke="#FFB800" strokeWidth={2} dot={{ r: 4 }} />
                                      <Line type="monotone" dataKey="Comments" stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}

                            {/* Advanced Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Avg % Post Read</p>
                                <p className="text-3xl font-black text-humand-navy">{(Number(intelligenceMetrics.avg_engagement_rate) * 100).toFixed(0)}%</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Total Posts Analyzed</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_posts)}</p>
                              </div>
                            </div>

                            {/* Strategic Recommendations */}
                            <section className="bg-humand-navy rounded-2xl p-6 text-white shadow-xl shadow-humand-navy/20">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center gap-2">
                                <Target size={14} />
                                Strategic Recommendations
                              </h3>
                              <div className="space-y-3">
                                {(historicalAnalysis?.recommendations || [
                                  "Increase posting frequency during peak engagement hours identified in the temporal patterns.",
                                  "Leverage interactive content (polls, questions) to boost comment rates, which are currently low.",
                                  "Consider segmented posting to target high-engagement audience groups more effectively.",
                                  "Experiment with different content formats — posts with images and documents tend to drive higher reaction rates."
                                ]).map((rec: string, i: number) => (
                                  <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors hover:translate-x-1">
                                    <div className="w-6 h-6 bg-humand-blue rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                                    <p className="text-xs text-white/80 leading-relaxed">{rec}</p>
                                  </div>
                                ))}
                              </div>
                            </section>

                            {/* Sentiment Distribution */}
                            <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-4 flex items-center gap-2">
                                <Smile size={14} className="text-humand-blue" />
                                Sentiment Distribution
                                {intelligenceSentiment && <span className="text-[9px] font-normal normal-case tracking-normal text-humand-text-secondary ml-2">({intelligenceSentiment.totalComments} comments analyzed, avg score: {intelligenceSentiment.avgScore})</span>}
                              </h3>
                              <div className="flex h-6 rounded-full overflow-hidden bg-humand-gray-bg">
                                <div className="bg-green-500 h-full rounded-l-full" style={{ width: `${intelligenceSentiment?.positive ?? 0}%` }} />
                                <div className="bg-yellow-400 h-full" style={{ width: `${intelligenceSentiment?.neutral ?? 100}%` }} />
                                <div className="bg-red-500 h-full rounded-r-full" style={{ width: `${intelligenceSentiment?.negative ?? 0}%` }} />
                              </div>
                              <div className="flex justify-between mt-3 text-[10px] font-bold">
                                <span className="text-green-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" />Positive {intelligenceSentiment?.positive ?? 0}%</span>
                                <span className="text-yellow-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />Neutral {intelligenceSentiment?.neutral ?? 100}%</span>
                                <span className="text-red-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" />Negative {intelligenceSentiment?.negative ?? 0}%</span>
                              </div>
                            </section>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-humand-text-secondary">
                            <BarChart3 size={48} className="opacity-20 mb-4" />
                            <p className="font-bold">No analysis generated yet</p>
                            <p className="text-sm">Select filters and click "Generate Insights".</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Selection Analysis Mode */
                      <div className="space-y-6">
                        {/* Filters */}
                        <div className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">Group</label>
                              <select value={selGroupFilter} onChange={e => setSelGroupFilter(e.target.value)} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy">
                                <option value="">All</option>
                                {humandContext?.availableGroups.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">From</label>
                              <input type="date" value={selDateFrom} onChange={e => setSelDateFrom(e.target.value)} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest block mb-1">To</label>
                              <input type="date" value={selDateTo} onChange={e => setSelDateTo(e.target.value)} className="w-full bg-humand-gray-bg border-none rounded-lg px-4 py-2.5 text-sm font-bold text-humand-navy" />
                            </div>
                          </div>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-humand-text-secondary" size={16} />
                            <input
                              type="text"
                              placeholder="Search posts..."
                              value={selSearchQuery}
                              onChange={e => setSelSearchQuery(e.target.value)}
                              className="w-full bg-humand-gray-bg border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={async () => {
                              if (!activeUserId) return;
                              setIsLoadingIntelligence(true);
                              try {
                                const posts = await fetchUserPostsFromDb(activeUserId, {
                                  groupId: selGroupFilter ? Number(selGroupFilter) : undefined,
                                  dateFrom: selDateFrom || undefined,
                                  dateTo: selDateTo || undefined,
                                  search: selSearchQuery || undefined,
                                });
                                setIntelligencePosts(posts);
                                setSelectedPostIds([]);
                              } catch (err) {
                                console.error('Failed to load posts:', err);
                              } finally {
                                setIsLoadingIntelligence(false);
                              }
                            }}
                            disabled={isLoadingIntelligence}
                            className="w-full bg-humand-gray-bg text-humand-navy rounded-xl py-2.5 text-sm font-bold hover:bg-humand-gray-border transition-all flex items-center justify-center gap-2"
                          >
                            {isLoadingIntelligence ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                            Load Posts
                          </button>
                        </div>

                        {/* Post selection grid */}
                        {intelligencePosts.length > 0 && (
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest">{intelligencePosts.length} posts found — select to analyze</p>
                            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto">
                              {intelligencePosts.map((post: DbPost) => (
                                <button
                                  key={post.id}
                                  onClick={() => {
                                    setSelectedPostIds(prev =>
                                      prev.includes(String(post.id))
                                        ? prev.filter(id => id !== String(post.id))
                                        : [...prev, String(post.id)]
                                    );
                                  }}
                                  className={cn(
                                    "text-left p-4 rounded-xl border-2 transition-all",
                                    selectedPostIds.includes(String(post.id))
                                      ? "border-humand-blue bg-humand-blue/5"
                                      : "border-humand-gray-border hover:border-humand-blue/30"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-humand-navy line-clamp-2">{post.body?.substring(0, 120)}</p>
                                      <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-humand-text-secondary">{new Date(post.publication_datetime).toLocaleDateString()}</span>
                                        <span className="text-[10px] text-humand-blue font-bold">{post.group_name || 'Feed'}</span>
                                        <span className="text-[10px] text-humand-text-secondary flex items-center gap-1"><Eye size={10} />{post.view_count}</span>
                                      </div>
                                    </div>
                                    <div className={cn(
                                      "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-1",
                                      selectedPostIds.includes(String(post.id)) ? "bg-humand-blue border-humand-blue text-white" : "border-humand-gray-border"
                                    )}>
                                      {selectedPostIds.includes(String(post.id)) && <Check size={12} strokeWidth={4} />}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>

                            {selectedPostIds.length > 0 && (
                              <button
                                onClick={async () => {
                                  setIsLoadingIntelligence(true);
                                  try {
                                    const postIds = selectedPostIds.map(Number);
                                    const [metrics, perPost, sentiment] = await Promise.all([
                                      fetchPostMetricsAggregate(postIds),
                                      fetchPostMetrics(postIds),
                                      fetchCommentSentiment(postIds),
                                    ]);
                                    setIntelligenceMetrics(metrics);
                                    setIntelligencePerPostMetrics(perPost);
                                    setIntelligenceSentiment(sentiment);
                                  } catch (err) {
                                    console.error('Analysis failed:', err);
                                  } finally {
                                    setIsLoadingIntelligence(false);
                                  }
                                }}
                                disabled={isLoadingIntelligence}
                                className="w-full bg-humand-navy text-white rounded-xl py-3 text-sm font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                              >
                                {isLoadingIntelligence ? <RefreshCw size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                                Analyze {selectedPostIds.length} Selected Post{selectedPostIds.length !== 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Selection Results — same metric cards as aggregated */}
                        {intelligenceMetrics && intelligenceMode === 'selection' && (
                          <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Unique Seen By</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_unique_viewers).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">People Who Commented</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_comments).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">People Who Reacted</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_reactions).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Total Seen By</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_views).toLocaleString()}</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Avg Engagement Rate</p>
                                <p className="text-3xl font-black text-humand-navy">{(Number(intelligenceMetrics.avg_engagement_rate) * 100).toFixed(1)}%</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Top Emoji</p>
                                <p className="text-3xl font-black text-humand-navy">{intelligenceMetrics.top_emoji || '—'}</p>
                              </div>
                            </div>

                            {intelligencePerPostMetrics.length > 0 && (
                              <div className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-4 flex items-center gap-2">
                                  <BarChart3 size={14} className="text-humand-blue" />
                                  Engagement Over Time
                                </h3>
                                <div className="h-64">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={intelligencePerPostMetrics.map((m: PostMetric, i: number) => ({
                                      name: `Post ${i + 1}`,
                                      Views: m.view_count,
                                      Reactions: m.reaction_count,
                                      Comments: m.comment_count,
                                    }))}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                      <YAxis tick={{ fontSize: 10 }} />
                                      <Tooltip />
                                      <Legend />
                                      <Line type="monotone" dataKey="Views" stroke="#0046FF" strokeWidth={2} dot={{ r: 4 }} />
                                      <Line type="monotone" dataKey="Reactions" stroke="#FFB800" strokeWidth={2} dot={{ r: 4 }} />
                                      <Line type="monotone" dataKey="Comments" stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}

                            {/* Advanced Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Avg % Post Read</p>
                                <p className="text-3xl font-black text-humand-navy">{(Number(intelligenceMetrics.avg_engagement_rate) * 100).toFixed(0)}%</p>
                              </div>
                              <div className="bg-white rounded-2xl p-5 border border-humand-gray-border shadow-sm">
                                <p className="text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest mb-1">Total Posts Analyzed</p>
                                <p className="text-3xl font-black text-humand-navy">{Number(intelligenceMetrics.total_posts)}</p>
                              </div>
                            </div>

                            {/* Strategic Recommendations */}
                            <section className="bg-humand-navy rounded-2xl p-6 text-white shadow-xl shadow-humand-navy/20">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center gap-2">
                                <Target size={14} />
                                Strategic Recommendations
                              </h3>
                              <div className="space-y-3">
                                {[
                                  "Increase posting frequency during peak engagement hours identified in the temporal patterns.",
                                  "Leverage interactive content (polls, questions) to boost comment rates, which are currently low.",
                                  "Consider segmented posting to target high-engagement audience groups more effectively.",
                                  "Experiment with different content formats — posts with images and documents tend to drive higher reaction rates."
                                ].map((rec, i) => (
                                  <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors hover:translate-x-1">
                                    <div className="w-6 h-6 bg-humand-blue rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                                    <p className="text-xs text-white/80 leading-relaxed">{rec}</p>
                                  </div>
                                ))}
                              </div>
                            </section>

                            {/* Sentiment Distribution */}
                            <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-4 flex items-center gap-2">
                                <Smile size={14} className="text-humand-blue" />
                                Sentiment Distribution
                                {intelligenceSentiment && <span className="text-[9px] font-normal normal-case tracking-normal text-humand-text-secondary ml-2">({intelligenceSentiment.totalComments} comments analyzed, avg score: {intelligenceSentiment.avgScore})</span>}
                              </h3>
                              <div className="flex h-6 rounded-full overflow-hidden bg-humand-gray-bg">
                                <div className="bg-green-500 h-full rounded-l-full" style={{ width: `${intelligenceSentiment?.positive ?? 0}%` }} />
                                <div className="bg-yellow-400 h-full" style={{ width: `${intelligenceSentiment?.neutral ?? 100}%` }} />
                                <div className="bg-red-500 h-full rounded-r-full" style={{ width: `${intelligenceSentiment?.negative ?? 0}%` }} />
                              </div>
                              <div className="flex justify-between mt-3 text-[10px] font-bold">
                                <span className="text-green-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" />Positive {intelligenceSentiment?.positive ?? 0}%</span>
                                <span className="text-yellow-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />Neutral {intelligenceSentiment?.neutral ?? 100}%</span>
                                <span className="text-red-600 flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" />Negative {intelligenceSentiment?.negative ?? 0}%</span>
                              </div>
                            </section>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentView === 'Feed' && (
              <div className="max-w-4xl mx-auto p-8">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-humand-navy">Feed</h1>
                </div>
                <FeedComposer
                  editor={editor}
                  content={content}
                  onLabsClick={handleLabsClick}
                  selectedSegmentIds={selectedSegmentIds}
                  onAudienceClick={() => setIsAudienceModalOpen(true)}
                  reach={currentReach}
                  selectedImage={selectedImage}
                  onImageUpload={handleImageUpload}
                  onRemoveImage={removeImage}
                  selectedDocument={selectedDocument}
                  onDocUpload={handleDocUpload}
                  onRemoveDoc={removeDoc}
                  poll={poll}
                  onPollClick={() => setIsPollModalOpen(true)}
                  onRemovePoll={() => setPoll(null)}
                  userName={humandContext?.userProfile?.name}
                  userAvatar={humandContext?.userProfile?.profilePicture}
                />

                <div className="mt-8 space-y-6">
                  {isLoadingFeed ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw size={24} className="animate-spin text-humand-blue" />
                    </div>
                  ) : feedPosts.length > 0 ? (
                    feedPosts.map(post => (
                      <MockPost
                        key={post.id}
                        author={`${post.first_name} ${post.last_name}`}
                        time={formatTimeAgo(post.publication_datetime)}
                        content={post.body_html || post.body}
                        avatarUrl={post.profile_picture}
                        viewCount={post.view_count}
                      />
                    ))
                  ) : (
                    <MockPost
                      author="Mayra Ebenau"
                      time="22 hours ago"
                      content="Hi Team! We're excited to announce that we are leveling up our recruitment game. On [Date], we are officially launching the new [Name of Module] within our Applicant Tracking System (ATS)."
                    />
                  )}
                </div>
              </div>
            )}

            {currentView === 'Groups' && (
              <div className="flex h-full">
                <div className="w-80 bg-white border-r border-humand-gray-border flex flex-col">
                  <div className="p-4 border-b border-humand-gray-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-humand-text-secondary" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search groups" 
                        className="w-full bg-humand-gray-bg border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <div className="px-3 py-2 text-[10px] font-bold text-humand-text-secondary uppercase tracking-widest flex justify-between items-center">
                      <span>Groups</span>
                      <button className="text-humand-blue hover:underline lowercase">Manage</button>
                    </div>
                    {humandContext?.availableGroups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveGroupId(group.id);
                          setSelectedGroupId(group.id);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                          activeGroupId === group.id ? "bg-humand-blue/5 text-humand-blue" : "hover:bg-humand-gray-bg text-humand-navy"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          activeGroupId === group.id ? "bg-humand-blue text-white" : "bg-humand-gray-bg text-humand-text-secondary"
                        )}>
                          <Users size={16} />
                        </div>
                        <span className="text-sm font-bold truncate">{group.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-white">
                  {activeGroupId ? (
                    <div className="max-w-3xl mx-auto p-8">
                      <div className="mb-8 flex items-start justify-between">
                        <div className="flex gap-6">
                          <div className="w-24 h-24 bg-humand-gray-bg rounded-2xl flex items-center justify-center text-humand-text-secondary">
                            <ImageIcon size={32} />
                          </div>
                          <div>
                            <h1 className="text-2xl font-bold text-humand-navy">{humandContext?.availableGroups.find(g => g.id === activeGroupId)?.name}</h1>
                            <p className="text-sm text-humand-text-secondary mt-1">This is a group for those who deal with people all the time or who work in human resources</p>
                            <div className="flex items-center gap-4 mt-4 text-xs font-medium text-humand-text-secondary">
                              <span className="flex items-center gap-1.5"><Eye size={14} /> Open Group</span>
                              <span>•</span>
                              <span>{humandContext?.availableGroups.find(g => g.id === activeGroupId)?.memberCount} members</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="p-2 text-humand-text-secondary hover:bg-humand-gray-bg rounded-lg border border-humand-gray-border"><Search size={18} /></button>
                          <button className="p-2 text-humand-text-secondary hover:bg-humand-gray-bg rounded-lg border border-humand-gray-border"><Plus size={18} /></button>
                        </div>
                      </div>
                      
                      <FeedComposer
                        editor={editor}
                        content={content}
                        onLabsClick={handleLabsClick}
                        reach={currentReach}
                        isGroup
                        groupName={humandContext?.availableGroups.find(g => g.id === activeGroupId)?.name}
                        selectedImage={selectedImage}
                        onImageUpload={handleImageUpload}
                        onRemoveImage={removeImage}
                        selectedDocument={selectedDocument}
                        onDocUpload={handleDocUpload}
                        onRemoveDoc={removeDoc}
                        poll={poll}
                        onPollClick={() => setIsPollModalOpen(true)}
                        onRemovePoll={() => setPoll(null)}
                        userName={humandContext?.userProfile?.name}
                        userAvatar={humandContext?.userProfile?.profilePicture}
                      />

                      <div className="mt-8">
                        <MockPost 
                          author="Company Communications"
                          time="September 8th, 2025 at 7:52 PM"
                          content="The Right HR Solution = Game-Changing Results. What happens when you equip your HR team with the right tools?"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-humand-text-secondary">
                      Select a group to start composing
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

          <AnimatePresence>
            {isLabsOpen && (
              <motion.div 
                initial={{ x: 500, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 500, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute right-0 top-0 bottom-0 w-[500px] bg-white border-l border-humand-gray-border flex flex-col shadow-2xl z-50 overflow-hidden"
              >
                {/* Sidebar Header */}
                <div className="px-6 py-6 border-b border-humand-gray-border flex items-center justify-between bg-white relative overflow-hidden shrink-0">
                  <div className="absolute top-0 left-0 w-full h-1 bg-humand-blue" />
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-humand-blue/10 text-humand-blue rounded-xl flex items-center justify-center shadow-inner">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-humand-navy tracking-tight uppercase">Comms Lab <span className="text-humand-blue">Check</span></h2>
                      <p className="text-[10px] text-humand-text-secondary font-bold uppercase tracking-wider">AI Analysis</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsLabsOpen(false)}
                    className="p-2 hover:bg-humand-gray-bg rounded-full transition-all text-humand-text-secondary hover:text-humand-navy"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Sidebar Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-humand-gray-bg/20">
                  {isAnalyzing ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-6 py-20">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-humand-blue/10 border-t-humand-blue rounded-full animate-spin" />
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-humand-blue" size={24} />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-lg font-bold text-humand-navy animate-pulse">Analyzing content...</p>
                        <p className="text-xs text-humand-text-secondary">Checking tone, sentiment, and risks.</p>
                      </div>
                    </div>
                  ) : analysis ? (
                    <div className="space-y-8">
                      {/* AI Rewrite Suggestions - ONLY SHOW HERE IF IT IS A PROMPT */}
                      {analysis.isPrompt && (
                        <section className="space-y-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2 px-1">
                            <RefreshCw size={14} className="text-humand-blue" />
                            AI Rewrite Suggestions
                          </h3>
                          <div className="space-y-4">
                            {analysis.rewrites.map((rw, i) => (
                              <div key={i} className="group relative bg-white rounded-2xl p-5 border border-humand-gray-border hover:border-humand-blue transition-all shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-humand-blue" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-blue">{rw.tone}</span>
                                  </div>
                                  <button 
                                    onClick={() => applyRewrite(rw.content)}
                                    className="text-[10px] font-bold bg-humand-blue text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md shadow-humand-blue/10"
                                  >
                                    Apply
                                    <ChevronRight size={10} />
                                  </button>
                                </div>
                                <div 
                                  className="text-sm text-humand-text-primary leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all font-medium prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: rw.content }}
                                />
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Engagement Analysis - ONLY SHOW IF NOT A PROMPT */}
                      {!analysis.isPrompt && (
                        <>
                          {/* Optimal Time Section */}
                          <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5">
                              <Clock size={80} />
                            </div>
                            <div className="relative z-10 space-y-4">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2">
                                <Clock size={14} className="text-humand-blue" />
                                Optimal Posting Time
                              </h3>
                              <div className="flex items-center gap-4">
                                <div className="bg-humand-blue/5 rounded-xl p-3 border border-humand-blue/10 flex-1">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-humand-blue mb-0.5">Best Day</p>
                                  <p className="text-lg font-black text-humand-navy">{analysis.optimalTime.day}</p>
                                </div>
                                <div className="bg-humand-blue/5 rounded-xl p-3 border border-humand-blue/10 flex-1">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-humand-blue mb-0.5">Best Time</p>
                                  <p className="text-lg font-black text-humand-navy">{analysis.optimalTime.time}</p>
                                </div>
                              </div>
                              
                              {/* Heatmap Table */}
                              <div className="mt-6 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Weekly Engagement Heatmap</p>
                                <div className="overflow-x-auto">
                                  <table className="w-full border-collapse">
                                    <thead>
                                      <tr>
                                        <th className="p-1"></th>
                                        {analysis.optimalTime.heatmap[0]?.slots.map(s => (
                                          <th key={s.time} className="p-1 text-[8px] font-bold uppercase text-humand-text-secondary text-center leading-tight">
                                            {s.time.split(' ')[0]}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {analysis.optimalTime.heatmap.map(day => (
                                        <tr key={day.day}>
                                          <td className="p-1 text-[9px] font-bold text-humand-navy pr-2">{day.day.substring(0, 3)}</td>
                                          {day.slots.map((slot, idx) => (
                                            <td key={idx} className="p-0.5">
                                              <div 
                                                className="w-full h-6 rounded-sm transition-transform hover:scale-110 cursor-help"
                                                style={{ 
                                                  backgroundColor: `rgba(0, 70, 255, ${slot.score / 100})`,
                                                  opacity: slot.score < 10 ? 0.1 : 1
                                                }}
                                                title={`${day.day} ${slot.time}: ${slot.score}% engagement`}
                                              />
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-humand-text-secondary pt-1">
                                  <span>Low Engagement</span>
                                  <div className="flex-1 mx-2 h-1 bg-gradient-to-r from-humand-blue/10 to-humand-blue rounded-full" />
                                  <span>High Engagement</span>
                                </div>
                              </div>

                              <p className="text-xs text-humand-text-secondary leading-relaxed font-medium pt-2">
                                {analysis.optimalTime.reason}
                              </p>
                            </div>
                          </section>

                          <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                              <BarChart3 size={14} className="text-humand-blue" />
                              Engagement Prediction
                            </h3>
                            <div className="h-[240px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analysis.segments.map(s => ({ ...s, engagement: s.engagement <= 1 ? Math.round(s.engagement * 100) : s.engagement }))} layout="vertical" margin={{ left: -20, right: 20 }}>
                                  <XAxis type="number" domain={[0, 100]} hide />
                                  <YAxis
                                    dataKey="name"
                                    type="category"
                                    axisLine={false}
                                    tickLine={false}
                                    width={100}
                                    tick={{ fontSize: 9, fontWeight: 700, fill: '#1A1A1A' }}
                                  />
                                  <Tooltip
                                    cursor={{ fill: 'rgba(0,70,255,0.03)' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '8px', fontSize: '10px' }}
                                    formatter={(value: number) => `${value}%`}
                                  />
                                  <Bar dataKey="engagement" radius={[0, 4, 4, 0]} barSize={20}>
                                    {analysis.segments.map((entry, index) => {
                                      const eng = entry.engagement <= 1 ? Math.round(entry.engagement * 100) : entry.engagement;
                                      return <Cell key={`cell-${index}`} fill={eng > 70 ? '#0046FF' : eng > 40 ? '#FFB800' : '#FF4B4B'} />;
                                    })}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </section>

                          <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                              <Sparkles size={14} className="text-humand-blue" />
                              Sentiment Analysis
                            </h3>
                            <div className="space-y-4">
                              {analysis.segments.map((segment, i) => {
                                const sent = segment.sentiment <= 1 ? Math.round(segment.sentiment * 100) : segment.sentiment;
                                return (
                                <div key={i} className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-humand-navy">{segment.name}</span>
                                    <span className={cn(
                                      "text-[10px] font-black uppercase tracking-widest",
                                      sent > 70 ? "text-emerald-600" : sent > 40 ? "text-amber-600" : "text-red-600"
                                    )}>
                                      {sent > 70 ? 'Positive' : sent > 40 ? 'Neutral' : 'Negative'} ({sent}%)
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full bg-humand-gray-bg rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${sent}%` }}
                                      className={cn(
                                        "h-full transition-all",
                                        sent > 70 ? "bg-emerald-500" : sent > 40 ? "bg-amber-500" : "bg-red-500"
                                      )}
                                    />
                                  </div>
                                  <p className="text-[9px] text-humand-text-secondary italic leading-tight">"{segment.interpretation}"</p>
                                </div>
                                );
                              })}
                            </div>
                          </section>

                          <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                              <AlertCircle size={14} className="text-red-500" />
                              Risk Assessment
                            </h3>
                            <div className="space-y-3">
                              {analysis.risks.map((risk, i) => (
                                <div key={i} className={cn(
                                  "p-4 rounded-xl flex gap-3 transition-all",
                                  risk.severity === 'high' ? "bg-red-50 text-red-900 border border-red-100" : 
                                  risk.severity === 'medium' ? "bg-amber-50 text-amber-900 border border-amber-100" : 
                                  "bg-blue-50 text-blue-900 border border-blue-100"
                                )}>
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                                    risk.severity === 'high' ? "bg-red-500 text-white" : 
                                    risk.severity === 'medium' ? "bg-amber-500 text-white" : 
                                    "bg-blue-500 text-white"
                                  )}>
                                    <AlertCircle size={16} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold capitalize mb-0.5">{risk.type} Risk</p>
                                    <p className="text-[10px] leading-relaxed opacity-80 font-medium">{risk.message}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>

                          {/* Poll Optimization — only when poll is attached */}
                          {poll && analysis.pollSuggestions.length > 0 && (
                            <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                                <BarChart2 size={14} className="text-humand-blue" />
                                Poll Optimization
                              </h3>
                              <div className="space-y-4">
                                {analysis.pollSuggestions.map((s, i) => (
                                  <div key={i} className="space-y-1">
                                    <p className="text-xs font-bold text-humand-navy">{s.suggestion}</p>
                                    <p className="text-[10px] text-humand-text-secondary leading-tight">{s.reason}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {/* Image Analysis — only when image is attached */}
                          {selectedImage && analysis.documentAnalysis && (
                            <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                                <ImageIcon size={14} className="text-humand-blue" />
                                Image Analysis
                              </h3>
                              <div className="space-y-4">
                                <div className="p-4 bg-humand-gray-bg/50 rounded-xl border border-humand-gray-border/50">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-humand-blue mb-2">Image Assessment</p>
                                  <p className="text-xs text-humand-text-primary leading-relaxed">{analysis.documentAnalysis.summary}</p>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-humand-blue">Visual Insights</p>
                                  <ul className="space-y-2">
                                    {analysis.documentAnalysis.insights.map((insight, i) => (
                                      <li key={i} className="flex gap-2 text-[10px] text-humand-text-secondary leading-tight">
                                        <div className="w-1 h-1 rounded-full bg-humand-blue mt-1.5 shrink-0" />
                                        {insight}
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="pt-2 border-t border-humand-gray-border/50">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-humand-blue mb-1">Relevance to Post</p>
                                  <p className="text-[10px] text-humand-text-secondary italic leading-tight">{analysis.documentAnalysis.relevance}</p>
                                </div>
                              </div>
                            </section>
                          )}

                          {/* Attachment Analysis — only when document is attached */}
                          {selectedDocument && analysis.attachmentComments.length > 0 && (
                            <section className="bg-white rounded-2xl p-6 border border-humand-gray-border shadow-sm">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary mb-6 flex items-center gap-2">
                                <FileText size={14} className="text-humand-blue" />
                                Attachment Analysis
                              </h3>
                              <div className="space-y-4">
                                {analysis.attachmentComments.map((c, i) => (
                                  <div key={i} className="space-y-1">
                                    <p className="text-xs font-bold text-humand-navy">{c.fileName}</p>
                                    <p className="text-[10px] text-humand-text-secondary leading-tight">{c.comment}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {/* AI Rewrite Suggestions - MOVED HERE FOR POST ANALYSIS */}
                          <section className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-text-secondary flex items-center gap-2 px-1">
                              <RefreshCw size={14} className="text-humand-blue" />
                              AI Rewrite Suggestions
                            </h3>
                            <div className="space-y-4">
                              {analysis.rewrites.map((rw, i) => (
                                <div key={i} className="group relative bg-white rounded-2xl p-5 border border-humand-gray-border hover:border-humand-blue transition-all shadow-sm">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-humand-blue" />
                                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-humand-blue">{rw.tone}</span>
                                    </div>
                                    <button 
                                      onClick={() => applyRewrite(rw.content)}
                                      className="text-[10px] font-bold bg-humand-blue text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md shadow-humand-blue/10"
                                    >
                                      Apply
                                      <ChevronRight size={10} />
                                    </button>
                                  </div>
                                  <div 
                                    className="text-sm text-humand-text-primary leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all font-medium prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: rw.content }}
                                  />
                                </div>
                              ))}
                            </div>
                          </section>
                          
                          <section className="bg-humand-navy rounded-2xl p-6 text-white shadow-xl shadow-humand-navy/20">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center gap-2">
                              <Target size={14} />
                              Recommended Actions
                            </h3>
                            <div className="space-y-4">
                              {analysis.recommendations.map((rec, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                                  <div className="w-6 h-6 bg-humand-blue rounded flex items-center justify-center text-white shrink-0">
                                    <CheckCircle2 size={14} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-white mb-0.5">{rec.action}</p>
                                    <p className="text-[10px] text-white/60 leading-relaxed">{rec.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-humand-text-secondary space-y-4 py-20">
                      <div className="w-16 h-16 bg-humand-gray-bg rounded-full flex items-center justify-center border border-humand-gray-border">
                        <MessageSquare size={24} className="opacity-20" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-lg font-bold text-humand-navy">No analysis data</p>
                        <p className="text-xs">Run a Labs Check to see insights.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Footer */}
                <div className="px-6 py-5 border-t border-humand-gray-border bg-white flex flex-col gap-4 shrink-0">
                  <div className="flex items-center gap-2 text-[9px] text-humand-text-secondary font-bold uppercase tracking-wider">
                    <Info size={12} className="text-humand-blue" />
                    AI predictions based on segment behavior.
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsLabsOpen(false)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-humand-text-secondary hover:bg-humand-gray-bg transition-all border border-humand-gray-border"
                    >
                      Close
                    </button>
                    <button 
                      onClick={handleLabsClick}
                      disabled={isAnalyzing}
                      className="flex-1 bg-humand-navy text-white py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-humand-navy/20 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={cn(isAnalyzing && "animate-spin")} />
                      Re-analyze
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      {/* Modals */}
      <PollModal 
        isOpen={isPollModalOpen} 
        onClose={() => setIsPollModalOpen(false)} 
        onSave={(p) => setPoll(p)} 
      />
      <AudienceModal 
        isOpen={isAudienceModalOpen}
        onClose={() => setIsAudienceModalOpen(false)}
        segmentations={humandContext?.availableSegmentations || []}
        selectedIds={selectedSegmentIds}
        onToggle={toggleSegment}
      />
    </>
  );
}

// Sub-components
function PollModal({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (poll: { question: string, options: string[] }) => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-humand-gray-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-humand-navy">Create Poll</h3>
          <button onClick={onClose} className="p-2 hover:bg-humand-gray-bg rounded-full"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Question</label>
            <input 
              type="text" 
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to ask?"
              className="w-full bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-humand-text-secondary">Options</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2">
                <input 
                  type="text" 
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...options];
                    newOpts[idx] = e.target.value;
                    setOptions(newOpts);
                  }}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 bg-humand-gray-bg border border-humand-gray-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-humand-blue/20 focus:outline-none"
                />
                {options.length > 2 && (
                  <button 
                    onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
            <button 
              onClick={() => setOptions([...options, ''])}
              className="w-full py-3 border-2 border-dashed border-humand-gray-border rounded-xl text-xs font-bold text-humand-text-secondary hover:border-humand-blue hover:text-humand-blue transition-all"
            >
              + Add Option
            </button>
          </div>
        </div>
        <div className="p-6 bg-humand-gray-bg/30 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold text-humand-text-secondary hover:bg-white transition-all">Cancel</button>
          <button 
            onClick={() => {
              if (question && options.every(o => o.trim())) {
                onSave({ question, options });
                onClose();
              }
            }}
            className="flex-1 bg-humand-blue text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-humand-blue/20"
          >
            Save Poll
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ToolbarButton({ icon, onClick, active }: { icon: React.ReactNode, onClick: () => void, active?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg transition-all",
        active ? "bg-humand-blue/10 text-humand-blue" : "text-humand-text-secondary hover:bg-humand-gray-bg"
      )}
    >
      {icon}
    </button>
  );
}

function NavItem({ icon, label, active = false, badge, hasSubmenu, onClick }: { icon: React.ReactNode, label: string, active?: boolean, badge?: number, hasSubmenu?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all group",
        active 
          ? "bg-blue-50 text-blue-600" 
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          "transition-colors",
          active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
        )}>
          {icon}
        </span>
        {label}
      </div>
      <div className="flex items-center gap-2">
        {badge !== undefined && (
          <span className="w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {badge}
          </span>
        )}
        {hasSubmenu && (
          <ChevronRight size={14} className={cn("transition-transform", active ? "text-blue-600" : "text-gray-400")} />
        )}
      </div>
    </button>
  );
}

function FeedComposer({ 
  editor, 
  content, 
  onLabsClick, 
  selectedSegmentIds, 
  onAudienceClick, 
  reach,
  isGroup,
  groupName,
  selectedImage,
  onImageUpload,
  onRemoveImage,
  selectedDocument,
  onDocUpload,
  onRemoveDoc,
  poll,
  onPollClick,
  onRemovePoll,
  userName,
  userAvatar
}: {
  editor: any,
  content: string,
  onLabsClick: () => void,
  selectedSegmentIds?: string[],
  onAudienceClick?: () => void,
  reach: number,
  isGroup?: boolean,
  groupName?: string,
  selectedImage?: any,
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onRemoveImage: () => void,
  selectedDocument?: any,
  onDocUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onRemoveDoc: () => void,
  poll?: any,
  onPollClick: () => void,
  onRemovePoll: () => void,
  userName?: string,
  userAvatar?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-humand-gray-border overflow-hidden">
      <div className="p-4 border-b border-humand-gray-border flex items-center justify-between bg-humand-gray-bg/30">
        <div className="flex items-center gap-3">
          {userAvatar ? (
            <img src={userAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 bg-orange-700 rounded-full flex items-center justify-center text-white font-bold">
              {(userName || 'ME').split(' ').map(n => n[0]).join('')}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-humand-navy">{userName || 'Mayra Ebenau'}</p>
            <button
              onClick={onAudienceClick}
              className="text-[10px] font-bold text-humand-blue hover:underline flex items-center gap-1"
            >
              {isGroup ? `Posting in ${groupName}` : (selectedSegmentIds?.length === 0 ? "All the organization" : `${selectedSegmentIds?.length} segments selected`)}
              {!isGroup && <ChevronDown size={10} />}
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-humand-navy">{reach.toLocaleString()}</p>
          <p className="text-[10px] text-humand-text-secondary uppercase tracking-widest font-bold">Reach</p>
        </div>
      </div>
      
      <div className="p-4 min-h-[120px]">
        <EditorContent editor={editor} />
        
        <div className="mt-4 flex flex-wrap gap-3">
          {selectedImage && (
            <div className="relative group inline-block">
              <img src={selectedImage.preview} alt="Upload" className="h-24 rounded-lg border border-humand-gray-border" />
              <button onClick={onRemoveImage} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          )}
          {selectedDocument && (
            <div className="relative group bg-humand-gray-bg border border-humand-gray-border rounded-lg p-3 flex items-center gap-2">
              <FileText size={16} className="text-humand-blue" />
              <span className="text-xs font-bold text-humand-navy truncate max-w-[100px]">{selectedDocument.name}</span>
              <button onClick={onRemoveDoc} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          )}
          {poll && (
            <div className="relative group bg-humand-blue/5 border border-humand-blue/10 rounded-lg p-3 min-w-[180px]">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 size={14} className="text-humand-blue" />
                <span className="text-[10px] font-bold text-humand-blue uppercase">Poll</span>
              </div>
              <p className="text-xs font-bold text-humand-navy truncate">{poll.question}</p>
              <button onClick={onRemovePoll} className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-humand-gray-border flex items-center justify-between bg-white">
        <div className="flex items-center gap-1">
          <input type="file" ref={fileInputRef} onChange={onImageUpload} accept="image/*" className="hidden" />
          <input type="file" ref={docInputRef} onChange={onDocUpload} className="hidden" />
          
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-humand-text-secondary hover:text-humand-blue hover:bg-humand-blue/5 rounded-lg transition-all">
            <ImageIcon size={18} />
          </button>
          <button onClick={() => docInputRef.current?.click()} className="p-2 text-humand-text-secondary hover:text-humand-blue hover:bg-humand-blue/5 rounded-lg transition-all">
            <FileUp size={18} />
          </button>
          <button onClick={onPollClick} className="p-2 text-humand-text-secondary hover:text-humand-blue hover:bg-humand-blue/5 rounded-lg transition-all">
            <BarChart2 size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={onLabsClick}
            className="flex items-center gap-2 px-4 py-1.5 bg-humand-blue text-white rounded-full text-[10px] font-bold hover:bg-blue-700 transition-all shadow-md shadow-humand-blue/20"
          >
            <Sparkles size={12} />
            Labs Check
          </button>
          <button className="px-6 py-1.5 bg-humand-navy text-white rounded-full text-[10px] font-bold hover:bg-slate-800 transition-all">
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MockPost({ author, time, content, avatarUrl, viewCount }: { author: string, time: string, content: string, avatarUrl?: string, viewCount?: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-humand-gray-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt={author} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 bg-humand-gray-bg rounded-full flex items-center justify-center text-humand-text-secondary font-bold">
            {author.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-bold text-humand-navy">{author}</p>
          <p className="text-[10px] text-humand-text-secondary">{time}</p>
        </div>
        {viewCount !== undefined && viewCount > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-humand-text-secondary">
            <Eye size={14} />
            <span>{viewCount.toLocaleString()}</span>
          </div>
        )}
      </div>
      <div className="text-sm text-humand-text-primary leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
      <div className="pt-4 border-t border-humand-gray-border flex items-center gap-6">
        <button className="flex items-center gap-2 text-xs font-bold text-humand-text-secondary hover:text-humand-blue transition-colors">
          <Smile size={16} /> Like
        </button>
        <button className="flex items-center gap-2 text-xs font-bold text-humand-text-secondary hover:text-humand-blue transition-colors">
          <MessageCircle size={16} /> Comment
        </button>
        <button className="flex items-center gap-2 text-xs font-bold text-humand-text-secondary hover:text-humand-blue transition-colors">
          <RefreshCw size={16} /> Share
        </button>
      </div>
    </div>
  );
}

function AudienceModal({ isOpen, onClose, segmentations, selectedIds, onToggle }: { 
  isOpen: boolean, 
  onClose: () => void, 
  segmentations: HumandSegmentation[], 
  selectedIds: string[], 
  onToggle: (id: string) => void 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-humand-gray-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-humand-navy">Select Audience</h3>
          <button onClick={onClose} className="p-2 hover:bg-humand-gray-bg rounded-full"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {segmentations.map(s => (
            <div key={s.id} className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-humand-text-secondary">{s.name}</h4>
              <div className="grid grid-cols-2 gap-3">
                {s.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onToggle(item.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                      selectedIds.includes(item.id) 
                        ? "border-humand-blue bg-humand-blue/5 text-humand-blue" 
                        : "border-humand-gray-border hover:border-humand-blue/30 text-humand-text-secondary"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      selectedIds.includes(item.id) ? "bg-humand-blue border-humand-blue text-white" : "border-humand-gray-border"
                    )}>
                      {selectedIds.includes(item.id) && <Check size={12} strokeWidth={4} />}
                    </div>
                    <span className="text-xs font-bold truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 bg-humand-gray-bg/30 flex gap-3">
          <button 
            onClick={() => {
              // Reset logic if needed
            }} 
            className="flex-1 py-3 rounded-xl text-sm font-bold text-humand-text-secondary hover:bg-white transition-all border border-humand-gray-border"
          >
            Clear All
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-humand-navy text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg"
          >
            Apply Audience
          </button>
        </div>
      </motion.div>
    </div>
  );
}
