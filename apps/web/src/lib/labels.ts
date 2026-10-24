/** Vietnamese labels for values stored in English. */
const POS_VI: Record<string, string> = {
  noun: 'danh từ',
  verb: 'động từ',
  'modal verb': 'động từ khuyết thiếu',
  'phrasal verb': 'cụm động từ',
  adjective: 'tính từ',
  adverb: 'trạng từ',
  pronoun: 'đại từ',
  determiner: 'từ hạn định',
  preposition: 'giới từ',
  conjunction: 'liên từ',
  exclamation: 'thán từ',
  number: 'số từ',
  'infinitive marker': 'tiểu từ to',
  contraction: 'dạng rút gọn',
  phrase: 'cụm từ',
};

export function posLabel(pos: string): string {
  return POS_VI[pos] ?? pos;
}

const TOPIC_VI: Record<string, string> = {
  'daily-life': 'Đời sống hằng ngày',
  travel: 'Du lịch',
};

export function topicLabel(topic: string): string {
  return TOPIC_VI[topic] ?? topic;
}

/** Cambridge Dictionary, American English entry. */
export function cambridgeUrl(lemma: string): string {
  const slug = lemma.toLowerCase().replace(/'/g, '-').replace(/\s+/g, '-');
  return `https://dictionary.cambridge.org/us/dictionary/english/${encodeURIComponent(slug)}`;
}

/** Route of a lesson page. */
export function lessonHref(l: { kind: 'reading' | 'listening'; slug: string }): string {
  return `${l.kind === 'reading' ? '/read' : '/listen'}/${l.slug}`;
}
