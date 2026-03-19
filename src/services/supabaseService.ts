import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseClient;
}

/**
 * Executes a read-only SQL query via direct REST call to exec_sql RPC.
 */
async function execSql<T = any>(sql: string): Promise<T[]> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) return [];

  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data || []) as T[];
}

// --- Feed Posts ---

export interface FeedPost {
  id: number;
  body: string;
  body_html: string;
  type: string;
  state: string;
  publication_datetime: string;
  view_count: number;
  first_name: string;
  last_name: string;
  profile_picture: string;
}

export async function fetchFeedPosts(limit = 10): Promise<FeedPost[]> {
  try {
    return await execSql<FeedPost>(`SELECT p.id, p.body, p.publication_datetime, p.state, p.type, p.view_count, u.first_name, u.last_name, u.profile_picture, pc.body_html FROM posts p LEFT JOIN users u ON p.user_id = u.id LEFT JOIN post_contents pc ON pc.post_id = p.id AND pc.is_current_content = true WHERE p.deleted_at IS NULL AND p.state = 'POSTED' ORDER BY p.publication_datetime DESC LIMIT ${limit}`);
  } catch (error) {
    console.error('Failed to fetch feed posts:', error);
    return [];
  }
}

// --- User Profile ---

export interface DbUserProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  profile_picture: string;
  instance_id: number;
}

export async function fetchUserProfile(userId: number): Promise<DbUserProfile | null> {
  try {
    const rows = await execSql<DbUserProfile>(`SELECT id, first_name, last_name, email, profile_picture, instance_id FROM users WHERE id = ${userId}`);
    return rows[0] || null;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }
}

export async function fetchMultipleUserProfiles(userIds: number[]): Promise<DbUserProfile[]> {
  try {
    return await execSql<DbUserProfile>(`SELECT id, first_name, last_name, email, profile_picture, instance_id FROM users WHERE id IN (${userIds.join(',')})`);
  } catch (error) {
    console.error('Failed to fetch user profiles:', error);
    return [];
  }
}

// --- User Groups ---

export interface DbUserGroup {
  group_id: number;
  group_name: string;
  members_count: number;
}

export async function fetchUserGroups(userId: number): Promise<DbUserGroup[]> {
  try {
    return await execSql<DbUserGroup>(`SELECT g.id as group_id, g.title as group_name, g.members_count FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = ${userId} AND gm.deleted_at IS NULL AND g.deleted_at IS NULL ORDER BY g.title`);
  } catch (error) {
    console.error('Failed to fetch user groups:', error);
    return [];
  }
}

// --- Segmentations ---

interface DbSegmentationGroup {
  id: number;
  name: string;
}

interface DbSegmentationItem {
  id: number;
  name: string;
  group_id: number;
}

interface DbUserSegmentations {
  user_id: number;
  segmentations: string[];
}

export interface AssembledSegmentation {
  id: string;
  name: string;
  description: string;
  items: { id: string; name: string }[];
}

export async function fetchUserSegmentations(userId: number): Promise<AssembledSegmentation[]> {
  try {
    const [userSegs, segGroups, segItems] = await Promise.all([
      execSql<DbUserSegmentations>(`SELECT user_id, segmentations FROM user_segmentation_items WHERE user_id = ${userId}`),
      execSql<DbSegmentationGroup>(`SELECT id, name FROM segmentation_groups WHERE deleted_at IS NULL ORDER BY name`),
      execSql<DbSegmentationItem>(`SELECT id, name, group_id FROM segmentation_items WHERE deleted_at IS NULL ORDER BY group_id, name`),
    ]);

    // Build lookup maps
    const groupMap = new Map(segGroups.map(g => [g.id, g.name]));
    const itemMap = new Map(segItems.map(i => [i.id, i]));

    // Parse user's segmentation assignments: format is "segGroupId_itemId"
    const userItemIds = new Set<number>();
    const userSegGroupIds = new Set<number>();
    if (userSegs[0]?.segmentations) {
      for (const entry of userSegs[0].segmentations) {
        const [segGroupId, itemId] = entry.split('_').map(Number);
        userItemIds.add(itemId);
        userSegGroupIds.add(segGroupId);
      }
    }

    // Build segmentation structure grouped by segmentation_group
    // Include ALL segmentation groups and their items (not just user's)
    const result: AssembledSegmentation[] = [];
    for (const sg of segGroups) {
      const items = segItems
        .filter(si => si.group_id === sg.id)
        .map(si => ({ id: String(si.id), name: si.name }));
      if (items.length > 0) {
        result.push({
          id: String(sg.id),
          name: sg.name,
          description: `Filter by ${sg.name}`,
          items,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to fetch user segmentations:', error);
    return [];
  }
}

// --- User Posts from DB (for Intelligence module) ---

export interface DbPost {
  id: number;
  body: string;
  body_html: string;
  publication_datetime: string;
  type: string;
  view_count: number;
  group_id: number | null;
  group_name: string | null;
}

export async function fetchUserPostsFromDb(userId: number, filters?: {
  groupId?: number;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<DbPost[]> {
  try {
    let where = `p.user_id = ${userId} AND p.deleted_at IS NULL AND p.state = 'POSTED'`;
    if (filters?.groupId) where += ` AND p.group_id = ${filters.groupId}`;
    if (filters?.type === 'feed') where += ` AND p.group_id IS NULL`;
    if (filters?.type === 'group') where += ` AND p.group_id IS NOT NULL`;
    if (filters?.dateFrom) where += ` AND p.publication_datetime >= '${filters.dateFrom}'`;
    if (filters?.dateTo) where += ` AND p.publication_datetime <= '${filters.dateTo}'`;
    if (filters?.search) where += ` AND p.body ILIKE '%${filters.search.replace(/'/g, "''")}%'`;
    return await execSql<DbPost>(`SELECT p.id, p.body, COALESCE(pc.body_html, p.body) as body_html, p.publication_datetime, p.type, p.view_count, p.group_id, g.title as group_name FROM posts p LEFT JOIN groups g ON g.id = p.group_id LEFT JOIN post_contents pc ON pc.post_id = p.id AND pc.is_current_content = true WHERE ${where} ORDER BY p.publication_datetime DESC LIMIT 50`);
  } catch (error) {
    console.error('Failed to fetch user posts from DB:', error);
    return [];
  }
}

// --- Post Metrics Aggregation ---

export interface PostMetricsAggregate {
  total_posts: number;
  total_views: number;
  total_unique_viewers: number;
  total_reactions: number;
  total_comments: number;
  avg_engagement_rate: number;
  avg_reaction_rate: number;
  avg_comment_rate: number;
  top_emoji: string | null;
  posts_with_polls: number;
  posts_with_key_updates: number;
}

export async function fetchPostMetricsAggregate(postIds: number[]): Promise<PostMetricsAggregate | null> {
  if (postIds.length === 0) return null;
  try {
    const rows = await execSql<PostMetricsAggregate>(`SELECT COUNT(*) as total_posts, COALESCE(SUM(view_count), 0) as total_views, COALESCE(SUM(unique_viewer_count), 0) as total_unique_viewers, COALESCE(SUM(reaction_count), 0) as total_reactions, COALESCE(SUM(comment_count), 0) as total_comments, COALESCE(AVG(engagement_rate), 0) as avg_engagement_rate, COALESCE(AVG(reaction_rate), 0) as avg_reaction_rate, COALESCE(AVG(comment_rate), 0) as avg_comment_rate, (SELECT top_emoji FROM metrics_post_summary WHERE post_id IN (${postIds.join(',')}) AND top_emoji IS NOT NULL GROUP BY top_emoji ORDER BY COUNT(*) DESC LIMIT 1) as top_emoji, COALESCE(SUM(CASE WHEN has_poll THEN 1 ELSE 0 END), 0) as posts_with_polls, COALESCE(SUM(CASE WHEN is_key_update THEN 1 ELSE 0 END), 0) as posts_with_key_updates FROM metrics_post_summary WHERE post_id IN (${postIds.join(',')})`);
    return rows[0] || null;
  } catch (error) {
    console.error('Failed to fetch post metrics aggregate:', error);
    return null;
  }
}

// --- Comment Sentiment Distribution ---

export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  totalComments: number;
  avgScore: number; // -1 to 1
}

export async function fetchCommentSentiment(postIds: number[]): Promise<SentimentDistribution> {
  if (postIds.length === 0) return { positive: 0, neutral: 100, negative: 0, totalComments: 0, avgScore: 0 };
  try {
    // Use SQL-based heuristic sentiment classification:
    // Positive: comments with positive emojis or congratulatory/positive words
    // Negative: comments with negative keywords
    // Neutral: everything else
    // Score: positive=1, neutral=0, negative=-1, then average
    const rows = await execSql<{ positive_count: number; negative_count: number; neutral_count: number; total: number }>(`SELECT COALESCE(SUM(CASE WHEN body ~* '(felicidades|gracias|excelente|increible|increíble|genial|bravo|bien|love|great|amazing|awesome|congratulations|👍|👏|❤|🎉|🎊|💪|🙌|😍|💯|🔥|⭐|💐|🥇|💜|😊|🤗|💕)' THEN 1 ELSE 0 END), 0) as positive_count, COALESCE(SUM(CASE WHEN body ~* '(mal|terrible|peor|horrible|triste|enojo|queja|problema|error|falta|nunca|pésimo|decepción|😡|😢|😤|👎|💔|😠|😞)' THEN 1 ELSE 0 END), 0) as negative_count, COALESCE(SUM(CASE WHEN NOT body ~* '(felicidades|gracias|excelente|increible|increíble|genial|bravo|bien|love|great|amazing|awesome|congratulations|👍|👏|❤|🎉|🎊|💪|🙌|😍|💯|🔥|⭐|💐|🥇|💜|😊|🤗|💕|mal|terrible|peor|horrible|triste|enojo|queja|problema|error|falta|nunca|pésimo|decepción|😡|😢|😤|👎|💔|😠|😞)' THEN 1 ELSE 0 END), 0) as neutral_count, COUNT(*) as total FROM comments WHERE commentable_type = 'post' AND commentable_id IN (${postIds.join(',')}) AND deleted_at IS NULL`);
    const r = rows[0];
    if (!r || r.total === 0) return { positive: 0, neutral: 100, negative: 0, totalComments: 0, avgScore: 0 };
    const total = Number(r.total);
    const pos = Number(r.positive_count);
    const neg = Number(r.negative_count);
    const neu = Number(r.neutral_count);
    const avgScore = (pos * 1 + neu * 0 + neg * -1) / total;
    return {
      positive: Math.round((pos / total) * 100),
      neutral: Math.round((neu / total) * 100),
      negative: Math.round((neg / total) * 100),
      totalComments: total,
      avgScore: Math.round(avgScore * 100) / 100,
    };
  } catch (error) {
    console.error('Failed to fetch comment sentiment:', error);
    return { positive: 0, neutral: 100, negative: 0, totalComments: 0, avgScore: 0 };
  }
}

// --- Per-Post Metrics (for charts) ---

export interface PostMetric {
  post_id: number;
  view_count: number;
  unique_viewer_count: number;
  reaction_count: number;
  comment_count: number;
  engagement_rate: number;
  publication_hour: number;
  publication_dow: number;
  top_emoji: string | null;
}

export async function fetchPostMetrics(postIds: number[]): Promise<PostMetric[]> {
  if (postIds.length === 0) return [];
  try {
    return await execSql<PostMetric>(`SELECT post_id, view_count, unique_viewer_count, reaction_count, comment_count, engagement_rate, publication_hour, publication_dow, top_emoji FROM metrics_post_summary WHERE post_id IN (${postIds.join(',')}) ORDER BY post_id`);
  } catch (error) {
    console.error('Failed to fetch post metrics:', error);
    return [];
  }
}

// --- Temporal Patterns (for heatmap) ---

export interface TemporalPattern {
  day_of_week: number;
  hour_of_day: number;
  avg_engagement_rate: number;
  post_count: number;
}

export async function fetchTemporalPatterns(instanceId: number): Promise<TemporalPattern[]> {
  try {
    return await execSql<TemporalPattern>(`SELECT day_of_week, hour_of_day, avg_engagement_rate, post_count FROM metrics_temporal_patterns WHERE instance_id = ${instanceId} ORDER BY day_of_week, hour_of_day`);
  } catch (error) {
    console.error('Failed to fetch temporal patterns:', error);
    return [];
  }
}

// --- Top Segments (for engagement/sentiment) ---

export interface TopSegment {
  segment_item_id: number;
  segment_name: string;
  segment_group_name: string;
  avg_engagement_rate: number;
  avg_view_rate: number;
  avg_reaction_rate: number;
  avg_comment_rate: number;
  most_engaged_post_type: string;
  posts_targeted: number;
}

export async function fetchTopSegments(instanceId: number, limit = 5): Promise<TopSegment[]> {
  try {
    return await execSql<TopSegment>(`SELECT segment_item_id, segment_name, segment_group_name, avg_engagement_rate, avg_view_rate, avg_reaction_rate, avg_comment_rate, most_engaged_post_type, posts_targeted FROM metrics_segment_engagement WHERE instance_id = ${instanceId} AND segment_item_id IS NOT NULL ORDER BY posts_targeted DESC LIMIT ${limit}`);
  } catch (error) {
    console.error('Failed to fetch top segments:', error);
    return [];
  }
}

// --- Legacy queryDatabase (used by geminiService) ---

export async function queryDatabase(sql: string) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('Supabase credentials not provided. Returning mock data.');
    return [];
  }

  try {
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.error('Supabase RPC error:', JSON.stringify(error));
      throw error;
    }
    return data || [];
  } catch (error) {
    console.error('Database query failed:', error instanceof Error ? error.message : JSON.stringify(error));
    return [];
  }
}
