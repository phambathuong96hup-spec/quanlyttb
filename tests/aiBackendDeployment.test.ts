import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerfiles = [
  'LightRAG-main/Dockerfile',
  'LightRAG-main/Dockerfile.lite',
];

const readEnvValue = (source: string, key: string) => {
  const line = source
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${key}=`));
  return line?.split('=', 2)[1] || '';
};

test('HuggingFace LightRAG config avoids the Gemini provider that failed document indexing', () => {
  const source = readFileSync('LightRAG-main/.env.huggingface', 'utf8');

  assert.equal(readEnvValue(source, 'LLM_BINDING'), 'openai');
  assert.equal(readEnvValue(source, 'LLM_BINDING_HOST'), 'https://router.huggingface.co/v1');
  assert.equal(readEnvValue(source, 'LLM_BINDING_API_KEY'), '${HF_TOKEN}');
  assert.equal(readEnvValue(source, 'LLM_MODEL'), 'openai/gpt-oss-20b:novita');
  assert.match(readEnvValue(source, 'LLM_FALLBACK_MODELS'), /fireworks-ai/);
  assert.equal(readEnvValue(source, 'EMBEDDING_BINDING'), 'hf_inference');
  assert.equal(
    readEnvValue(source, 'EMBEDDING_MODEL'),
    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
  );
  assert.equal(readEnvValue(source, 'EMBEDDING_DIM'), '384');
  assert.equal(readEnvValue(source, 'EMBEDDING_BINDING_API_KEY'), '${HF_TOKEN}');
  assert.equal(
    readEnvValue(source, 'EMBEDDING_BINDING_HOST'),
    'https://router.huggingface.co/hf-inference/models',
  );
  assert.doesNotMatch(source, /^LLM_BINDING=gemini$/m);
  assert.doesNotMatch(source, /^EMBEDDING_BINDING=gemini$/m);
});

test('LightRAG server supports HuggingFace Inference API embeddings', () => {
  const config = readFileSync('LightRAG-main/lightrag/api/config.py', 'utf8');
  const server = readFileSync('LightRAG-main/lightrag/api/lightrag_server.py', 'utf8');
  const provider = readFileSync('LightRAG-main/lightrag/llm/hf_inference.py', 'utf8');

  assert.match(config, /"hf_inference"/);
  assert.match(server, /from lightrag\.llm\.hf_inference import hf_inference_embed/);
  assert.match(provider, /pipeline\/feature-extraction/);
  assert.match(provider, /HF_TOKEN/);
});

test('Space can run the read-only legal RAG backend without paid inference credits', () => {
  assert.equal(existsSync('LightRAG-main/legal-knowledge.json'), true);

  const entrypoint = readFileSync('LightRAG-main/lightrag/api/huggingface_entrypoint.py', 'utf8');
  const server = readFileSync('LightRAG-main/lightrag/api/legal_rag_server.py', 'utf8');
  const dockerfile = readFileSync('LightRAG-main/Dockerfile', 'utf8');

  assert.match(entrypoint, /LIGHTWEIGHT_LEGAL_RAG/);
  assert.match(entrypoint, /from lightrag\.api\.legal_rag_server import main/);
  assert.match(server, /\/documents\/status_counts/);
  assert.match(server, /\/query\/stream/);
  assert.match(server, /@app\.get\("\/"\)/);
  assert.match(server, /id="question-form"/);
  assert.match(server, /fetch\('\/query'/);
  assert.match(server, /TBDeviceCare-AI/);
  assert.match(server, /id="toggle-status"/);
  assert.match(server, /id="open-library"/);
  assert.match(server, /library-drawer/);
  assert.match(server, /renderDocuments/);
  assert.match(server, /renderMarkdown/);
  assert.match(server, /ref-chip/);
  assert.match(server, /pending\.querySelector\('\.message-body'\)\.innerHTML = renderMarkdown/);
  assert.match(server, /_ensure_answer_sections/);
  assert.match(server, /REQUIRED_ANSWER_SECTIONS/);
  assert.match(server, /### Tóm tắt/);
  assert.match(server, /### Căn cứ trong tài liệu/);
  assert.match(server, /### Việc cần làm/);
  assert.match(server, /### Lưu ý/);
  assert.doesNotMatch(server, /quick-prompts/);
  assert.doesNotMatch(server, /metric-grid/);
  assert.doesNotMatch(server, /<aside class="side"/);
  assert.doesNotMatch(server, /pending\.textContent = data\.response/);
  assert.match(server, /chat\/completions/);
  assert.match(server, /answer_source/);
  assert.match(server, /retrieval_fallback/);
  assert.match(server, /LLM_FALLBACK_MODELS/);
  assert.match(server, /LLM_BINDING_API_KEY/);
  assert.doesNotMatch(server, /Useful endpoints/);
  assert.match(dockerfile, /COPY legal-knowledge\.json \/app\/legal-knowledge\.json/);
});

test('LightRAG Docker images load the HuggingFace config before server startup', () => {
  assert.equal(existsSync('LightRAG-main/lightrag/api/huggingface_entrypoint.py'), true);

  dockerfiles.forEach((filePath) => {
    const source = readFileSync(filePath, 'utf8');
    assert.match(source, /COPY \.env\.huggingface \/app\/\.env\.huggingface/);
    assert.match(source, /lightrag\.api\.huggingface_entrypoint/);
  });

  const entrypoint = readFileSync('LightRAG-main/lightrag/api/huggingface_entrypoint.py', 'utf8');
  assert.match(entrypoint, /load_dotenv\([^)]*override=True/s);
  assert.match(entrypoint, /from lightrag\.api\.lightrag_server import main/);
});

test('HuggingFace config file is allowed through the root gitignore', () => {
  const gitignore = readFileSync('.gitignore', 'utf8');

  assert.match(gitignore, /!LightRAG-main\/\.env\.huggingface/);
});

test('HuggingFace config file is included in the Space Docker build context', () => {
  const dockerignore = readFileSync('LightRAG-main/.dockerignore', 'utf8');

  assert.match(dockerignore, /^!\.env\.huggingface$/m);
  assert.match(dockerignore, /^\.env_example$/m);
});
