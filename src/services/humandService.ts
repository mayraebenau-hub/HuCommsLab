import { fetchUserProfile, fetchUserGroups, fetchUserSegmentations } from './supabaseService';

/**
 * Mock service for Humand API interactions.
 * In a real app, these would be actual API calls with authentication.
 */

export interface HumandGroup {
  id: string;
  name: string;
  memberCount: number;
}

export interface HumandSegmentationItem {
  id: string;
  name: string;
}

export interface HumandSegmentation {
  id: string;
  name: string;
  description: string;
  items: HumandSegmentationItem[];
}

export interface UserProfile {
  id: string;
  name: string;
  position: string;
  department: string;
  subordinatesCount: number;
  instanceId: number;
  profilePicture?: string;
  previousPosts: {
    title: string;
    engagement: number;
    tone: string;
  }[];
}

export interface UserPermissions {
  canCreateSegmentedPosts: boolean;
  availableGroups: HumandGroup[];
  availableSegmentations: HumandSegmentation[];
  userProfile: UserProfile;
}

export interface UserPost {
  id: string;
  title: string;
  content: string;
  date: string;
  engagement: number;
  reach: number;
  dimension: string;
  audience: string;
}

export async function getUserPosts(): Promise<UserPost[]> {
  // Simulating an API call delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return [
    {
      id: 'p1',
      title: 'New Office Policy Update',
      content: 'We are updating our office policy to include more flexible working hours. Starting next month, you can choose your core hours between 10 AM and 4 PM.',
      date: '2025-09-01',
      engagement: 85,
      reach: 1200,
      dimension: 'Feed',
      audience: 'All organization'
    },
    {
      id: 'p2',
      title: 'Employee Appreciation Week!',
      content: 'A huge thank you to everyone for their hard work this quarter! We are celebrating with a week of events, including a team lunch and extra wellness activities.',
      date: '2025-08-15',
      engagement: 92,
      reach: 1150,
      dimension: 'Feed',
      audience: 'All organization'
    },
    {
      id: 'p3',
      title: 'Q3 Town Hall Recap',
      content: 'For those who missed it, here is a summary of our Q3 Town Hall. We discussed our growth targets, new product launches, and our commitment to sustainability.',
      date: '2025-07-20',
      engagement: 78,
      reach: 900,
      dimension: 'Groups',
      audience: 'Product Strategy'
    },
    {
      id: 'p4',
      title: 'Sustainability Initiative Launch',
      content: 'We are excited to launch our new sustainability initiative! Our goal is to reduce our carbon footprint by 20% over the next two years.',
      date: '2025-06-10',
      engagement: 88,
      reach: 1100,
      dimension: 'Feed',
      audience: 'All organization'
    },
    {
      id: 'p5',
      title: 'New Benefits Package',
      content: 'Check out our updated benefits package, including enhanced mental health support and new parental leave policies.',
      date: '2025-05-05',
      engagement: 95,
      reach: 1250,
      dimension: 'Feed',
      audience: 'All organization'
    }
  ];
}

export async function getHumandContext(userId?: number): Promise<UserPermissions> {
  if (userId) {
    const [profile, groups, segmentations] = await Promise.all([
      fetchUserProfile(userId),
      fetchUserGroups(userId),
      fetchUserSegmentations(userId),
    ]);

    return {
      canCreateSegmentedPosts: true,
      availableGroups: groups.map(g => ({
        id: String(g.group_id),
        name: g.group_name,
        memberCount: g.members_count,
      })),
      availableSegmentations: segmentations.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        items: s.items,
      })),
      userProfile: {
        id: String(userId),
        name: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown',
        position: '',
        department: '',
        subordinatesCount: 0,
        instanceId: profile?.instance_id || 1,
        profilePicture: profile?.profile_picture || '',
        previousPosts: [],
      },
    };
  }

  // Fallback mock data
  await new Promise(resolve => setTimeout(resolve, 800));
  return {
    canCreateSegmentedPosts: true,
    availableGroups: [
      { id: 'g1', name: 'Engineering All-Hands', memberCount: 150 },
      { id: 'g2', name: 'Product Strategy', memberCount: 45 },
      { id: 'g3', name: 'Culture & Wellbeing', memberCount: 800 },
      { id: 'g4', name: 'EMEA Sales Team', memberCount: 120 },
    ],
    availableSegmentations: [
      { id: 's1', name: 'Department', description: 'Filter by department', items: [{ id: 'd1', name: 'HR' }, { id: 'd2', name: 'IT' }, { id: 'd3', name: 'Legal' }, { id: 'd4', name: 'Marketing' }, { id: 'd5', name: 'Production' }, { id: 'd6', name: 'Sales' }, { id: 'd7', name: 'Support' }] },
      { id: 's2', name: 'Job Position', description: 'Filter by job title', items: [{ id: 'j1', name: 'Director' }, { id: 'j2', name: 'Employee' }, { id: 'j3', name: 'Manager' }, { id: 'j4', name: 'Supervisor' }] },
      { id: 's3', name: 'Location', description: 'Filter by office location', items: [{ id: 'l1', name: 'Dublin' }, { id: 'l2', name: 'London' }, { id: 'l3', name: 'Oslo' }, { id: 'l4', name: 'Reykjavík' }, { id: 'l5', name: 'Stockholm' }] },
    ],
    userProfile: {
      id: 'u1',
      name: 'Mayra Ebenau',
      position: 'Internal Communications Director',
      department: 'HR',
      subordinatesCount: 12,
      instanceId: 1,
      previousPosts: [
        { title: 'New Office Policy Update', engagement: 85, tone: 'Direct & Clear' },
        { title: 'Employee Appreciation Week!', engagement: 92, tone: 'Inspirational' },
        { title: 'Q3 Town Hall Recap', engagement: 78, tone: 'Formal/Compliance' },
      ],
    },
  };
}

export function calculateReach(
  postDimension: 'Feed' | 'Group',
  selectedGroupId: string,
  selectedSegmentIds: string[],
  availableGroups: HumandGroup[],
  availableSegmentations: HumandSegmentation[]
): number {
  if (postDimension === 'Group') {
    const group = availableGroups.find(g => g.id === selectedGroupId);
    return group ? group.memberCount : 0;
  }

  if (selectedSegmentIds.length === 0) {
    return 1250; // Total organization size
  }

  // Mock calculation logic:
  // Each segment has a random weight between 50 and 200
  // AND logic between different types, OR logic within same type
  const groupedSegments: { [key: string]: number } = {};
  
  selectedSegmentIds.forEach(id => {
    for (const s of availableSegmentations) {
      const item = s.items.find(i => i.id === id);
      if (item) {
        if (!groupedSegments[s.id]) groupedSegments[s.id] = 0;
        groupedSegments[s.id] += 100; // Simplified: each item adds 100
        break;
      }
    }
  });

  const values = Object.values(groupedSegments);
  if (values.length === 0) return 1250;
  
  // Intersection (AND) of segments: we take the average but cap it
  const total = values.reduce((acc, val) => acc + val, 0);
  return Math.min(Math.round(total / values.length) * 1.5, 1250);
}
