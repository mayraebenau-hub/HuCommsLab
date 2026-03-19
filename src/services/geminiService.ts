import { Type, FunctionDeclaration } from "@google/genai";
import { queryDatabase } from "./supabaseService";

// Proxy all Gemini API calls through the serverless function
async function callGeminiProxy(params: { model: string; contents: any; config?: any }) {
  const resp = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `Gemini proxy returned ${resp.status}`);
  }
  return resp.json();
}

const COMMS_LAB_DATA_CONTEXT = `
# Comms Lab — AI Agent Data Context

## 1. Your Role
You are an internal communications analyst for Humand, a platform that connects employees through posts, groups, surveys, and knowledge resources. You have read-only SQL access to a Supabase database containing historical engagement data.

An admin is creating a new post. They provide you with a draft including: body text, post type, target group, target segments, whether it includes a poll, whether it is a key update, and any attachments.

Your job is to analyze historical engagement data and the draft itself to produce a pre-flight insight report with the following sections:
1. **Optimal posting time** — best day of week and hour to publish
2. **Engagement prediction by segmentation** — how each target segment is expected to engage
3. **Sentiment analysis** — analysis of the draft text tone, clarity, and emotional resonance
4. **Risk assessment** — potential issues (ambiguity, negative readings, missing context, compliance)
5. **Poll optimization** — suggestions to improve poll questions/options if applicable
6. **Document analysis** — evaluation of linked documents or references in the post
7. **Attachment analysis** — assessment of media types and their expected impact on engagement
8. **AI rewrite suggestions** — improved versions of the text aligned with the chosen tone and audience
9. **Recommended actions** — follow-up actions to maximize impact (FAQ, pulse survey, manager toolkit, Q&A)

---

## 2. Pre-computed Metrics Tables
These tables are refreshed periodically by a batch job. They contain aggregated engagement data ready for fast querying. Always filter by \`instance_id\` matching the admin's community.

### 2.1 \`metrics_post_summary\`
Individual performance record for each published post.
- \`post_id\`: INTEGER PK
- \`instance_id\`: INTEGER
- \`group_id\`: INTEGER
- \`post_type\`: VARCHAR
- \`is_key_update\`: BOOLEAN
- \`has_poll\`: BOOLEAN
- \`publication_hour\`: SMALLINT (0–23)
- \`publication_dow\`: SMALLINT (0=Monday, 6=Sunday)
- \`audience_size\`: INTEGER
- \`view_count\`: INTEGER
- \`unique_viewer_count\`: INTEGER
- \`reaction_count\`: INTEGER
- \`comment_count\`: INTEGER
- \`poll_response_count\`: INTEGER
- \`engagement_rate\`: NUMERIC (\`unique_viewer_count / audience_size\`)
- \`reaction_rate\`: NUMERIC (\`reaction_count / unique_viewer_count\`)
- \`comment_rate\`: NUMERIC (\`comment_count / unique_viewer_count\`)
- \`top_emoji\`: VARCHAR
- \`top_emoji_count\`: INTEGER
- \`hours_to_peak_engagement\`: NUMERIC

### 2.2 \`metrics_segment_engagement\`
Average engagement rates for each audience segment.
- \`instance_id\`: INTEGER
- \`segment_item_id\`: INTEGER
- \`segment_group_id\`: INTEGER
- \`segment_name\`: VARCHAR
- \`segment_group_name\`: VARCHAR
- \`posts_targeted\`: INTEGER
- \`avg_view_rate\`: NUMERIC
- \`avg_reaction_rate\`: NUMERIC
- \`avg_comment_rate\`: NUMERIC
- \`avg_engagement_rate\`: NUMERIC
- \`most_engaged_post_type\`: VARCHAR

### 2.3 \`metrics_temporal_patterns\`
Average engagement by time slot (hour of day × day of week).
- \`instance_id\`: INTEGER
- \`hour_of_day\`: SMALLINT
- \`day_of_week\`: SMALLINT
- \`avg_view_rate\`: NUMERIC
- \`avg_reaction_rate\`: NUMERIC
- \`avg_comment_rate\`: NUMERIC
- \`avg_engagement_rate\`: NUMERIC
- \`post_count\`: INTEGER

### 2.4 \`metrics_reaction_distribution\`
Distribution of emoji reactions.
- \`instance_id\`: INTEGER
- \`segment_item_id\`: INTEGER (NULL for global)
- \`emoji\`: VARCHAR
- \`unicode\`: VARCHAR
- \`reaction_count\`: INTEGER
- \`percentage\`: NUMERIC

### 2.5 \`metrics_group_engagement\`
Average engagement for posts published within each group.
- \`instance_id\`: INTEGER
- \`group_id\`: INTEGER
- \`group_name\`: VARCHAR
- \`total_posts\`: INTEGER
- \`avg_views\`: NUMERIC
- \`avg_reactions\`: NUMERIC
- \`avg_comments\`: NUMERIC
- \`avg_engagement_rate\`: NUMERIC
- \`best_hour\`: SMALLINT
- \`best_dow\`: SMALLINT

### 2.6 \`metrics_content_type_performance\`
Benchmark engagement by content type.
- \`instance_id\`: INTEGER
- \`post_type\`: VARCHAR
- \`has_poll\`: BOOLEAN
- \`is_key_update\`: BOOLEAN
- \`post_count\`: INTEGER
- \`avg_views\`: NUMERIC
- \`avg_reactions\`: NUMERIC
- \`avg_comments\`: NUMERIC
- \`avg_engagement_rate\`: NUMERIC

---

## 3. Content & Reference Tables
- \`posts\`: Historical posts with metadata.
- \`post_contents\`: Full body content and HTML.
- \`comments\`: User comments.
- \`reactions\`: Emoji reactions.
- \`groups\`: Community groups.
- \`segmentation_groups\`: Categories of segmentation.
- \`segmentation_items\`: Individual segments.
- \`segmentations\`: Links posts to target segments.
- \`user_segmentation_items\`: Maps users to segments.
- \`instances\`: Communities on the platform.
- \`attachments\`: Files attached to posts.
- \`polls\` and \`poll_options\`: Surveys attached to posts.
- \`key_updates\` and \`key_update_reads\`: Mandatory-read posts.

---

## 4. Table Relationships
- \`instances\` -> \`users\`, \`groups\`, \`segmentation_groups\`, \`posts\`, \`metrics_*\`
- \`posts\` -> \`post_contents\`, \`attachments\`, \`reactions\`, \`comments\`, \`segmentations\`, \`polls\`, \`key_updates\`
- \`segmentations\` -> \`segmentation_items\`
- \`user_segmentation_items\` -> \`users\`

---

## 5. Data Conventions
- \`publication_dow\`: 0 = Monday, 6 = Sunday (ISO 8601)
- \`publication_hour\`: 0–23, in the timezone of the instance
- Rate fields: Values between 0 and 1 (e.g. 0.15 = 15%)
- Instance filtering: Always filter by \`instance_id\` matching the admin's community
- \`state\`: \`'POSTED'\`, \`'SCHEDULED'\`
- \`status\`: \`'ACTIVE'\`, \`'DEACTIVATED'\`, \`'UNCLAIMED'\`
`;

const queryDatabaseFunctionDeclaration: FunctionDeclaration = {
  name: "queryDatabase",
  parameters: {
    type: Type.OBJECT,
    description: "Executes a read-only SQL query on the Supabase database to retrieve historical engagement data.",
    properties: {
      sql: {
        type: Type.STRING,
        description: "The SQL query to execute. Must be read-only (SELECT).",
      },
    },
    required: ["sql"],
  },
};

export interface AnalysisResult {
  isPrompt: boolean; // True if the input is a prompt (e.g., "Write a post...") rather than a post draft
  segments: {
    name: string;
    sentiment: number; // 0 to 100
    engagement: number; // 0 to 100
    interpretation: string;
  }[];
  risks: {
    type: "ambiguity" | "negative" | "context" | "compliance";
    message: string;
    severity: "low" | "medium" | "high";
  }[];
  rewrites: {
    tone: string;
    content: string;
  }[];
  recommendations: {
    action: string;
    description: string;
  }[];
  pollSuggestions: {
    suggestion: string;
    reason: string;
  }[];
  documentAnalysis?: {
    summary: string;
    insights: string[];
    relevance: string;
  };
  attachmentComments: {
    fileName: string;
    comment: string;
  }[];
  optimalTime: {
    day: string;
    time: string;
    reason: string;
    heatmap: {
      day: string;
      slots: {
        time: string;
        score: number; // 0 to 100
      }[];
    }[];
  };
}

const ENGAGEMENT_BEST_PRACTICES = `
Top tips for keeping/getting users more engaged:

1. WHERE to post:
   - Ensure groups are clearly defined and structured.
   - Avoid "white noise" groups.
   - Match content to the group's purpose (social vs. business updates).

2. WHEN to post:
   - Don't just click "post" when ready.
   - Create routines for key posts so users know when to expect them (like influencers).
   - Account for employee schedules (meetings, busy work hours).

3. WHO is posting:
   - Use champions, managers, and "big names" in the company.
   - For top management, consider having their EAs post from their accounts to make it feel more personal than an official "Internal Comms" post.

4. WHAT kind of content:
   - Avoid "talking at" users.
   - Use conversational, clear, and authentic language (not press releases).
   - Start with a STRONG HOOK: Curious, relatable, or slightly provocative first lines.
   - Focus on ONE clear idea per post (Insight, Lesson, Announcement, or Story).
   - Tell a STORY: Use the structure: Context -> Challenge -> Action -> Result.
   - Use formatting to make it SCANNABLE: Short paragraphs, line breaks, bullet points.
   - Share VALUE: Teach something, share insights, or give practical tips.
   - End with a simple CALL TO ACTION (CTA): Ask a question to prompt comments.
   - Use DATA + EMOTION: Combine credibility (data) with connection (emotion).

5. WHAT features to use:
   - Use interactive features like Polls and Live videos.
   - Video is easier to digest but requires time; Polls are quick and interactive.

6. QUICK FORMULA for posts:
   Hook -> Context -> Insight / Story -> Takeaway -> Question.

7. AVOID common mistakes:
   - Too formal.
   - Too long without structure.
   - No clear takeaway or CTA.
   - Pure self-promotion.
`;

const HUMAND_MODULES = `
- People Experience
- Service Management
- Forms & Workflows
- Time Tracking
- Time Off
- Onboarding
- Performance Review
- Goals and OKRs
- Learning
- Surveys
- Internal Social Network (Feed)
- Chat
- Live Streaming
- Events
- Kudos
- Marketplace
- Birthdays & Anniversaries
- Knowledge Libraries
- Org Chart
- Quick Links
- Files
- Digital Employee File
- Insights
`;

export async function analyzeContent(
  content: string,
  targetTone: string,
  segments: string[],
  image?: { data: string; mimeType: string },
  userInfo?: any,
  pollData?: { question: string; options: string[] },
  attachmentData?: { name: string; content?: string },
  temporalData?: any[],
  topSegments?: any[]
): Promise<AnalysisResult> {
  // Build temporal data context for the heatmap
  const temporalContext = temporalData && temporalData.length > 0
    ? `\nPRE-FETCHED TEMPORAL PATTERNS (from metrics_temporal_patterns):
${JSON.stringify(temporalData)}
Use this data DIRECTLY for the optimalTime heatmap. Map day_of_week (0=Monday..6=Sunday) to day names. Map hour_of_day to time slots. Convert avg_engagement_rate to a 0-100 score (multiply by 100). Find the best day+hour combination for "day" and "time" fields. Do NOT query the database for temporal patterns — use this data.`
    : '';

  // Build top segments context
  const segmentsContext = topSegments && topSegments.length > 0
    ? `\nTOP SEGMENTS BY AUDIENCE SIZE (from metrics_segment_engagement):
${JSON.stringify(topSegments)}
For engagement prediction and sentiment analysis, use ONLY these segments (the top segments in the community by user count). Each segment should appear in the "segments" array with engagement and sentiment scores based on this data and the post content.`
    : '\nNo pre-computed segment engagement data available. Use the target audience segments for engagement prediction and sentiment analysis.';

  const promptText = `
    ${COMMS_LAB_DATA_CONTEXT}

    Analyze the following employee communication draft for a platform called Humand.

    Content: "${content}"
    Target Tone: ${targetTone}
    Target Segments: ${segments.join(", ")}

    NOTE: The "Content" might be provided in HTML format. Please analyze it accordingly.

    USER CONTEXT:
    - Name: ${userInfo?.name}
    - Position: ${userInfo?.position}
    - Department: ${userInfo?.department}
    - Subordinates: ${userInfo?.subordinatesCount}
    - Previous Posts Style: ${userInfo?.previousPosts?.map((p: any) => p.tone).join(", ")}
    - Community Instance ID: ${userInfo?.instanceId || 1}
    ${temporalContext}
    ${segmentsContext}

    ${image ? "An image has been attached to this post. Please analyze the image for effectiveness, relevance, and engagement impact. Populate the documentAnalysis field with your image analysis (summary = image assessment, insights = visual observations, relevance = how it supports the message)." : ""}
    ${pollData ? `A poll is included: Question: "${pollData.question}", Options: [${pollData.options.join(", ")}]` : ""}
    ${attachmentData ? `A document has been attached: Name: "${attachmentData.name}". ${attachmentData.content ? `Document Content: "${attachmentData.content}"` : ""}` : ""}

    HUMAND MODULES AVAILABLE:
    ${HUMAND_MODULES}

    CRITICAL INSTRUCTIONS:
    1. USE THE DATABASE: You have access to historical engagement data via the \`queryDatabase\` tool. Use it to find performance of similar post types for this community (instance_id: ${userInfo?.instanceId || 1}).
    2. Determine if the input "Content" is a draft post or a prompt. Set "isPrompt" accordingly.
    3. If "isPrompt" is true, focus primarily on generating high-quality "rewrites" (post options) based on the instructions.
    4. HEATMAP: ${temporalData && temporalData.length > 0 ? 'Use the pre-fetched temporal patterns data provided above. Do NOT query the database for this.' : 'Query the database for temporal patterns.'}
    5. CONDITIONAL SECTIONS — IMPORTANT:
       a. IMAGE ANALYSIS (documentAnalysis field): ${image ? 'An image IS attached. Analyze it and populate documentAnalysis.' : 'No image attached. Leave documentAnalysis as null. If an image would help this post, add a suggestion to recommendations.'}
       b. ATTACHMENT ANALYSIS (attachmentComments): ${attachmentData ? 'An attachment IS present. Analyze it.' : 'No attachment present. Return empty attachmentComments array. If attachments would help, add a suggestion to recommendations.'}
       c. POLL OPTIMIZATION (pollSuggestions): ${pollData ? 'A poll IS included. Analyze and suggest improvements.' : 'No poll included. Return empty pollSuggestions array. If a poll would benefit this post, add a suggestion to recommendations.'}
    6. FORMATTING: Use Tiptap-compatible HTML for rewrites.
    7. ENGAGEMENT BEST PRACTICES: Use the provided rules.
    ${ENGAGEMENT_BEST_PRACTICES}

    Provide a detailed "preflight check" as specified in your role description.
  `;

  const contents: any[] = [{ role: 'user', parts: [{ text: promptText }] }];
  if (image) {
    contents[0].parts.push({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType,
      },
    });
  }

  // Use a loop to handle potential function calls
  let response;
  let toolCallsHandled = false;

  while (!toolCallsHandled) {
    response = await callGeminiProxy({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [queryDatabaseFunctionDeclaration] }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isPrompt: { type: Type.BOOLEAN },
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sentiment: { type: Type.NUMBER },
                  engagement: { type: Type.NUMBER },
                  interpretation: { type: Type.STRING },
                },
                required: ["name", "sentiment", "engagement", "interpretation"],
              },
            },
            risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["ambiguity", "negative", "context", "compliance"] },
                  message: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
                },
                required: ["type", "message", "severity"],
              },
            },
            rewrites: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tone: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ["tone", "content"],
              },
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["action", "description"],
              },
            },
            pollSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  suggestion: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ["suggestion", "reason"],
              },
            },
            documentAnalysis: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                insights: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                relevance: { type: Type.STRING }
              },
              required: ["summary", "insights", "relevance"]
            },
            attachmentComments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fileName: { type: Type.STRING },
                  comment: { type: Type.STRING },
                },
                required: ["fileName", "comment"],
              },
            },
            optimalTime: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                time: { type: Type.STRING },
                reason: { type: Type.STRING },
                heatmap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      day: { type: Type.STRING },
                      slots: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            time: { type: Type.STRING },
                            score: { type: Type.NUMBER },
                          },
                          required: ["time", "score"],
                        },
                      },
                    },
                    required: ["day", "slots"],
                  },
                },
              },
              required: ["day", "time", "reason", "heatmap"],
            },
          },
          required: ["isPrompt", "segments", "risks", "rewrites", "recommendations", "pollSuggestions", "attachmentComments", "optimalTime"],
        },
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of functionCalls) {
        if (call.name === "queryDatabase") {
          const result = await queryDatabase((call.args as any).sql);
          functionResponses.push({
            name: call.name,
            response: { result },
            id: call.id
          });
        }
      }
      
      // Add the model's turn and the function response to the conversation
      contents.push(response.candidates[0].content);
      contents.push({
        role: 'user',
        parts: functionResponses.map(res => ({
          functionResponse: res
        }))
      });
    } else {
      toolCallsHandled = true;
    }
  }

  return JSON.parse(response?.text || "{}");
}

export interface HistoricalAnalysisResult {
  performanceSummary: string;
  keyPatterns: string;
  audienceInsights: string;
  trendAnalysis: string;
  recommendations: string[];
}

export async function analyzeHistoricalPerformance(
  dimension: string,
  audience: string,
  metrics: any,
  instanceId: number = 1
): Promise<HistoricalAnalysisResult> {
  const promptText = `
    ${COMMS_LAB_DATA_CONTEXT}

    Analyze the historical performance across the user's posts based on the following configuration and metrics.
    
    CONFIGURATION:
    - Dimension: ${dimension}
    - Audience: ${audience}
    - Community Instance ID: ${instanceId}

    METRICS (Aggregated Across Posts):
    ${JSON.stringify(metrics, null, 2)}

    HUMAND MODULES AVAILABLE:
    ${HUMAND_MODULES}

    CRITICAL INSTRUCTIONS:
    1. USE THE DATABASE: You have access to historical engagement data via the \`queryDatabase\` tool. Use it to compare these metrics against community benchmarks (instance_id: ${instanceId}).
    2. Performance Overview: Summarize overall performance (reach vs potential, engagement volume, general trends).
    3. Identify Patterns Behind Engagement: Detect what drives higher engagement (frequency, themes, timing). Explain why.
    4. Audience Insights: Analyze segment behavior, gaps in reach/engagement, and missed opportunities.
    5. Trend Analysis: Identify peaks, drops, consistency vs volatility, and momentum/fatigue.
    6. Forward-Looking Recommendations: Focus on future strategy (frequency, patterns, structure, reach, interaction, audience targeting). Include at least one cross-module recommendation.

    CRITICAL CONSTRAINTS:
    - Do NOT rewrite or edit specific posts.
    - Do NOT give copy-level feedback.
    - Do NOT refer to individual posts explicitly.
    - Tone: Strategic and insight-driven, clear and concise. Focus on why and what to do next. Avoid generic statements.
  `;

  const contents: any[] = [{ role: 'user', parts: [{ text: promptText }] }];
  let response;
  let toolCallsHandled = false;

  while (!toolCallsHandled) {
    response = await callGeminiProxy({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [queryDatabaseFunctionDeclaration] }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            performanceSummary: { type: Type.STRING },
            keyPatterns: { type: Type.STRING },
            audienceInsights: { type: Type.STRING },
            trendAnalysis: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          required: ["performanceSummary", "keyPatterns", "audienceInsights", "trendAnalysis", "recommendations"],
        },
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of functionCalls) {
        if (call.name === "queryDatabase") {
          const result = await queryDatabase((call.args as any).sql);
          functionResponses.push({
            name: call.name,
            response: { result },
            id: call.id
          });
        }
      }
      contents.push(response.candidates[0].content);
      contents.push({
        role: 'user',
        parts: functionResponses.map(res => ({
          functionResponse: res
        }))
      });
    } else {
      toolCallsHandled = true;
    }
  }

  return JSON.parse(response?.text || "{}");
}

export async function analyzeSelectedPosts(
  posts: { title: string; content: string; date: string; engagement: number }[],
  instanceId: number = 1
): Promise<HistoricalAnalysisResult> {
  const promptText = `
    ${COMMS_LAB_DATA_CONTEXT}

    Analyze the following specific set of employee communication posts as a cohesive group.
    
    POSTS TO ANALYZE:
    ${posts.map((p, i) => `Post ${i + 1}:
      Title: ${p.title}
      Date: ${p.date}
      Engagement: ${p.engagement}%
      Content: "${p.content}"`).join("\n\n")}
    
    YOUR GOAL:
    Provide a unified analysis of these specific posts. Identify the common themes, how they relate to each other (e.g., as a series), and their collective impact.
    
    CRITICAL INSTRUCTIONS:
    1. USE THE DATABASE: You have access to historical engagement data via the \`queryDatabase\` tool. Use it to compare these posts against community benchmarks (instance_id: ${instanceId}).
    2. Narrative Consistency: How well do these posts build a single story or theme?
    3. Collective Performance: What was the overall impact of this specific group of posts?
    4. Thematic Insights: What are the core messages being communicated across these posts?
    5. Strategic Recommendations: How should the user continue this specific narrative or series?
    
    OUTPUT STRUCTURE (Strictly follow this):
    1. performanceSummary: High-level overview of this specific set of posts.
    2. keyPatterns: Thematic links and narrative flow between the posts.
    3. audienceInsights: How the audience responded to this specific topic/series.
    4. trendAnalysis: Evolution of engagement across these specific posts.
    5. recommendations: 3-5 clear, actionable suggestions for future posts in this specific series or topic.
  `;

  const contents: any[] = [{ role: 'user', parts: [{ text: promptText }] }];
  let response;
  let toolCallsHandled = false;

  while (!toolCallsHandled) {
    response = await callGeminiProxy({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [queryDatabaseFunctionDeclaration] }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            performanceSummary: { type: Type.STRING },
            keyPatterns: { type: Type.STRING },
            audienceInsights: { type: Type.STRING },
            trendAnalysis: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          required: ["performanceSummary", "keyPatterns", "audienceInsights", "trendAnalysis", "recommendations"],
        },
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];
      for (const call of functionCalls) {
        if (call.name === "queryDatabase") {
          const result = await queryDatabase((call.args as any).sql);
          functionResponses.push({
            name: call.name,
            response: { result },
            id: call.id
          });
        }
      }
      contents.push(response.candidates[0].content);
      contents.push({
        role: 'user',
        parts: functionResponses.map(res => ({
          functionResponse: res
        }))
      });
    } else {
      toolCallsHandled = true;
    }
  }

  return JSON.parse(response?.text || "{}");
}

export async function draftFromBrief(brief: string, tone: string): Promise<string[]> {
  const response = await callGeminiProxy({
    model: "gemini-3-flash-preview",
    contents: `
      Draft 3 professional employee communication options for the Humand platform based on this brief: "${brief}".
      Target Tone: ${tone}
      
      CRITICAL RULES:
      1. DO NOT include any intros (e.g., "Here are your options") or conclusions.
      2. The content must be strictly for the Humand platform. DO NOT suggest posts for Slack, email, or other competitors.
      3. Use HTML formatting compatible with Tiptap (e.g., <p>, <strong>, <em>, <u>, <s>, <a>, <h1>, <h2>, <ul>, <ol>, <li>, <code>, <blockquote>). Use emojis, bullet points, and bold text to make the post more engaging.
      4. Use the following engagement best practices to make the posts more effective:
      ${ENGAGEMENT_BEST_PRACTICES}
      5. Return the options as a JSON array of strings containing the HTML content.
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [response.text || ""];
  }
}
