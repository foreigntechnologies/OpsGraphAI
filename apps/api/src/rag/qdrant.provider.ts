import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface KnowledgeDoc {
  id: number;
  slug: string;
  title: string;
  category: string;
  content: string;
  summary: string;
  tags: string[];
}

export interface SearchResult {
  doc: KnowledgeDoc;
  score: number;
  source: 'qdrant_vector' | 'local_lexical';
}

export class QdrantKnowledgeProvider {
  private qdrantUrl: string;
  private collectionName = 'opsgraph_knowledge';
  private vectorDim = 128;
  private localDocs: KnowledgeDoc[] = [];
  private isInitialized = false;

  constructor(qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333') {
    this.qdrantUrl = qdrantUrl;
  }

  public async initialize(): Promise<boolean> {
    try {
      await this.loadLocalDocuments();
      await this.ensureCollection();
      await this.indexDocuments();
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn('[QdrantKnowledgeProvider] Qdrant unavailable or indexing failed, falling back to local lexical search:', err);
      this.isInitialized = false;
      return false;
    }
  }

  public computeVector(text: string): number[] {
    const vector = new Array(this.vectorDim).fill(0);
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % this.vectorDim;
      vector[idx] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => Number((v / norm).toFixed(6)));
  }

  private async ensureCollection(): Promise<void> {
    const getRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`);
    if (getRes.ok) {
      return;
    }

    const createRes = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: this.vectorDim,
          distance: 'Cosine',
        },
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create Qdrant collection: HTTP ${createRes.status}`);
    }
  }

  public async loadLocalDocuments(): Promise<KnowledgeDoc[]> {
    const rootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const runbooksDir = resolve(rootDir, 'knowledge/runbooks');
    const archDir = resolve(rootDir, 'knowledge/architecture');

    const docs: KnowledgeDoc[] = [];
    let idCounter = 1;

    // Load runbooks
    try {
      const runbookFiles = await readdir(runbooksDir);
      for (const file of runbookFiles) {
        if (!file.endsWith('.md')) continue;
        const filePath = resolve(runbooksDir, file);
        const content = await readFile(filePath, 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = (titleMatch && titleMatch[1]) ? titleMatch[1].trim() : file.replace('.md', '');
        const slug = file.replace('.md', '');

        docs.push({
          id: idCounter++,
          slug,
          title,
          category: 'runbook',
          content,
          summary: `Operational SRE runbook for diagnosing and remediating ${slug.replace('-', ' ')}.`,
          tags: [slug, 'runbook', 'sre', 'incident'],
        });
      }
    } catch (e) {
      console.warn('Could not read runbooks directory:', e);
    }

    // Load architecture
    try {
      const archFiles = await readdir(archDir);
      for (const file of archFiles) {
        if (!file.endsWith('.md')) continue;
        const filePath = resolve(archDir, file);
        const content = await readFile(filePath, 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = (titleMatch && titleMatch[1]) ? titleMatch[1].trim() : file.replace('.md', '');
        const slug = file.replace('.md', '');

        docs.push({
          id: idCounter++,
          slug,
          title,
          category: 'architecture',
          content,
          summary: `System architecture and microservices topology documentation.`,
          tags: [slug, 'architecture', 'microservices'],
        });
      }
    } catch (e) {
      console.warn('Could not read architecture directory:', e);
    }

    this.localDocs = docs;
    return docs;
  }

  public async indexDocuments(): Promise<number> {
    if (this.localDocs.length === 0) {
      await this.loadLocalDocuments();
    }

    const points = this.localDocs.map((doc) => ({
      id: doc.id,
      vector: this.computeVector(`${doc.title} ${doc.tags.join(' ')} ${doc.content}`),
      payload: {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        summary: doc.summary,
        tags: doc.tags,
        content: doc.content,
      },
    }));

    const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      throw new Error(`Failed to index points into Qdrant: HTTP ${res.status}`);
    }

    return points.length;
  }

  public async searchKnowledge(query: string, limit = 3): Promise<SearchResult[]> {
    const queryVector = this.computeVector(query);

    try {
      const res = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: queryVector,
          limit,
          with_payload: true,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const results = json.result || [];
        if (results.length > 0) {
          return results.map((r: any) => ({
            doc: {
              id: r.id,
              slug: r.payload.slug,
              title: r.payload.title,
              category: r.payload.category,
              summary: r.payload.summary,
              tags: r.payload.tags || [],
              content: r.payload.content,
            },
            score: Number(r.score.toFixed(4)),
            source: 'qdrant_vector',
          }));
        }
      }
    } catch {
      // Fall through to local lexical search
    }

    // Local lexical search fallback
    return this.searchLocalLexical(query, limit);
  }

  private searchLocalLexical(query: string, limit = 3): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = this.localDocs.map((doc) => {
      const text = `${doc.title} ${doc.summary} ${doc.tags.join(' ')} ${doc.content}`.toLowerCase();
      let matchCount = 0;
      for (const term of terms) {
        if (text.includes(term)) matchCount++;
      }
      const score = terms.length > 0 ? matchCount / terms.length : 0;
      return { doc, score: Number(score.toFixed(4)), source: 'local_lexical' as const };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
