import { QdrantKnowledgeProvider } from '../rag/qdrant.provider.js';

async function main() {
  console.log('[RAG] Initializing Qdrant and loading knowledge base documents...');
  const qdrant = new QdrantKnowledgeProvider();
  const ok = await qdrant.initialize();
  if (!ok) {
    console.error('[RAG] Failed to connect to Qdrant on port 6333.');
    return;
  }

  const count = await qdrant.indexDocuments();
  console.log(`[RAG] Successfully indexed ${count} documents into Qdrant collection 'opsgraph_knowledge'!`);
}

main().catch((err) => {
  console.error('[RAG] Indexing error:', err);
});
