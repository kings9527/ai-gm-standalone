/**
 * 文本预处理模块
 * 提供：分段、字数统计、关键词提取
 */

export interface TextStats {
  totalChars: number;
  totalWords: number;
  paragraphs: number;
  sentences: number;
  avgSentenceLength: number;
}

export interface TextSegment {
  id: string;
  index: number;
  content: string;
  charCount: number;
  wordCount: number;
  isSceneBreak: boolean;
}

export interface KeywordResult {
  word: string;
  count: number;
  weight: number;
}

// 中文常用停用词
const STOP_WORDS_CN = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '之', '与', '及', '等', '或', '但是', '而', '因为', '所以', '如果', '虽然', '然后', '接着', '于是', '不过', '只是', '这样', '那样', '这里', '那里', '什么', '怎么', '为什么', '如何', '谁', '哪', '哪个', '哪些', '时候', '地方', '东西', '事情', '问题', '情况', '时候', '现在', '过去', '未来', '今天', '明天', '昨天', '正在', '已经', '曾经', '曾经', '一直', '总是', '经常', '有时候', '偶尔', '突然', '慢慢', '很快', '非常', '特别', '比较', '相当', '太', '很', '最', '更', '越', '多么', '多少', '几', '一些', '一点', '许多', '很多', '大量', '少数', '几个', '各种', '各个', '每个', '一位', '一名', '一种', '一方面', '一直', '一切', '所有', '全体', '整体', '部分', '局部', '个别', '其他', '另外', '其余', '之外', '以内', '之间', '前后', '左右', '上下', '内外', '以上', '以下', '以前', '以后', '以外', '以内', '之中', '之外', '之间', '一方面', '另一方面', '第一', '第二', '第三', '首先', '其次', '最后', '总之', '总而言之', '综上所述', '由此可见', '因此', '因而', '于是', '从而', '可见', '显然', '明显', '无疑', '肯定', '绝对', '完全', '彻底', '根本', '基本', '主要', '重要', '关键', '核心', '重点', '中心', '焦点', '主题', '话题', '议题', '题目', '标题', '名称', '名字', '称呼', '叫做', '称为', '名叫', '名为', '即', '也就是', '亦即', '换言之', '换句话说', '换句话说', '即', '也就是', '亦即',
]);

// 英文常用停用词
const STOP_WORDS_EN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'ought', 'need', 'dare', 'used',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'and', 'but', 'or', 'yet', 'so', 'if', 'because', 'although', 'though',
  'while', 'where', 'when', 'that', 'which', 'who', 'whom', 'whose', 'what',
  'this', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them',
  'their', 'them', 'us', 'our', 'ours', 'your', 'yours', 'his', 'hers',
]);

/**
 * 统计文本基本信息
 */
export function analyzeText(text: string): TextStats {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const sentences = text.split(/[。.！!？?;；]/).filter((s) => s.trim().length > 0);
  const cleanText = text.replace(/\s+/g, '');
  const totalChars = cleanText.length;
  // 中文字符 + 英文单词
  const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const enWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const totalWords = cnChars + enWords;

  return {
    totalChars,
    totalWords,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    avgSentenceLength: sentences.length > 0 ? Math.round(totalChars / sentences.length) : 0,
  };
}

/**
 * 将文本分段
 * 策略：按场景分隔符（---、***、## 等）或按自然段落分组
 * @param text 原始文本
 * @param maxSegmentChars 每段最大字符数（默认 2000）
 */
export function segmentText(text: string, maxSegmentChars: number = 2000): TextSegment[] {
  // 先尝试按场景分隔符分割
  const sceneBreakPattern = /(?:\n\s*(?:---+|\*\*\*|#{1,3}\s+.+|场景[：:]\s*.+|第[一二三四五六七八九十\d]+章[\s:：])\s*\n)/g;
  const rawSegments: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sceneBreakPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      rawSegments.push(text.slice(lastIndex, match.index).trim());
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    rawSegments.push(text.slice(lastIndex).trim());
  }

  // 如果没有找到分隔符，则按段落分组
  if (rawSegments.length <= 1) {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let currentSegment = '';
    for (const para of paragraphs) {
      if (currentSegment.length + para.length > maxSegmentChars && currentSegment.length > 0) {
        rawSegments.push(currentSegment.trim());
        currentSegment = para;
      } else {
        currentSegment += '\n\n' + para;
      }
    }
    if (currentSegment.trim()) {
      rawSegments.push(currentSegment.trim());
    }
  }

  // 构建 segment 对象
  return rawSegments
    .filter((s) => s.length > 0)
    .map((content, index) => {
      const clean = content.replace(/\s+/g, '');
      const cnChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
      const enWords = (content.match(/[a-zA-Z]+/g) || []).length;
      return {
        id: `seg_${index}`,
        index,
        content,
        charCount: clean.length,
        wordCount: cnChars + enWords,
        isSceneBreak: /---+|\*\*\*|#{1,3}\s|场景[：:]|第[一二三四五六七八九十\d]+章/.test(content.slice(0, 50)),
      };
    });
}

/**
 * 提取关键词（基于词频统计，去除停用词）
 */
export function extractKeywords(text: string, topN: number = 20): KeywordResult[] {
  const freq = new Map<string, number>();

  // 匹配中文字符串（2-6个字）
  const cnMatches = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];
  for (const word of cnMatches) {
    if (STOP_WORDS_CN.has(word)) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // 匹配英文单词
  const enMatches = text.match(/[a-zA-Z]{3,}/g) || [];
  for (const word of enMatches) {
    const lower = word.toLowerCase();
    if (STOP_WORDS_EN.has(lower)) continue;
    freq.set(lower, (freq.get(lower) || 0) + 1);
  }

  // 计算总词频作为权重基准
  const totalFreq = Array.from(freq.values()).reduce((a, b) => a + b, 0) || 1;

  // 排序并返回前 N 个
  return Array.from(freq.entries())
    .map(([word, count]) => ({
      word,
      count,
      weight: Number((count / totalFreq).toFixed(4)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * 智能摘要：提取文本开头 + 关键段落
 */
export function generateSummary(text: string, maxChars: number = 500): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return text.slice(0, maxChars);

  let summary = paragraphs[0];
  let i = 1;
  while (i < paragraphs.length && summary.length + paragraphs[i].length + 2 <= maxChars) {
    summary += '\n\n' + paragraphs[i];
    i++;
  }
  return summary;
}

/**
 * 预处理管道：一次性完成分段、统计、关键词提取
 */
export interface PreprocessResult {
  originalText: string;
  stats: TextStats;
  segments: TextSegment[];
  keywords: KeywordResult[];
  summary: string;
}

export function preprocessStory(text: string): PreprocessResult {
  return {
    originalText: text,
    stats: analyzeText(text),
    segments: segmentText(text),
    keywords: extractKeywords(text),
    summary: generateSummary(text),
  };
}
