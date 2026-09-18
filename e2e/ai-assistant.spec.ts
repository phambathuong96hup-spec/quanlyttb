import { test, expect, type Page } from '@playwright/test';

const syntheticIndex = {
  version: 2,
  generatedAt: '2026-09-17',
  source: 'synthetic-review',
  documents: [
    {
      id: 'qa',
      title: 'Tài liệu QA',
      fileName: 'qa.txt',
      description: 'kiểm thử',
      charLength: 100,
    },
  ],
  chunks: [
    {
      id: 'qa-1',
      documentId: 'qa',
      documentTitle: 'Tài liệu QA',
      documentDescription: 'kiểm thử',
      fileName: 'qa.txt',
      sectionTitle: 'Kiểm thử',
      chunkIndex: 0,
      text: 'Kiểm thử thiết bị QA chỉ dùng làm dữ liệu giả lập phục vụ kiểm tra phần mềm, không phải hướng dẫn kỹ thuật hay pháp lý.',
      tokenEstimate: 40,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'qlttb.auth',
      JSON.stringify({
        username: 'qa',
        role: 'Admin',
        token: 'qa-token',
        expiresAt: Date.now() + 3600000,
      }),
    );
  });
  await page.route('**/macros/s/**/exec*', (route) => {
    route.fulfill({ contentType: 'application/json', body: '{"success":true,"data":[]}' });
  });
});

const sendQuestion = async (page: Page, text = 'kiểm thử thiết bị QA') => {
  const input = page.getByPlaceholder('Nhập câu hỏi về quy trình, quy chuẩn kỹ thuật hoặc định mức vật tư...');
  await input.fill(text);
  await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click();
};

test('backend 503 fallback must be labelled Local RAG and display citations', async ({ page }) => {
  await page.route('**/query/stream', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.route('**/rag/legal-knowledge.json', (route) => route.fulfill({ json: syntheticIndex }));

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage).toContainText('Tài liệu QA');
  await expect(assistantMessage.locator('.ai-source-tag')).toHaveText('Local RAG');
  await expect(page.locator('.ai-status-indicator')).toContainText('Local RAG');
});

test('first offline query must recover after network returns', async ({ page }) => {
  await page.route('**/query/stream', (route) => route.abort());
  let available = false;
  await page.route('**/rag/legal-knowledge.json', (route) => (available ? route.fulfill({ json: syntheticIndex }) : route.abort()));

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  await expect(page.locator('.ai-message-row.assistant').last()).toContainText('Không thể hoàn tất tra cứu');

  available = true;
  await sendQuestion(page);

  await expect(page.locator('.ai-message-row.assistant').last()).toContainText('Tài liệu QA');
  await expect(page.locator('.ai-message-row.assistant').last().locator('.ai-source-tag')).toHaveText('Local RAG');
});

test('retrieval-only backend response must not be labelled LLM', async ({ page }) => {
  await page.route('**/query/stream', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          response: 'Trích đoạn QA',
          answer_source: 'retrieval_fallback',
          llm_error: 'provider unavailable',
          references: [],
        }) + '\n',
    }),
  );

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage).toContainText('Trích đoạn QA');
  await expect(assistantMessage.locator('.ai-source-tag')).not.toHaveText('Cloud LLM');
  await expect(assistantMessage.locator('.ai-source-tag')).toHaveText('Trích đoạn Cloud');
  await expect(page.locator('.ai-status-indicator')).toContainText('Trích đoạn Đám mây');
});

test('reset during in-flight query must not restore previous answer', async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });

  await page.route('**/query/stream', async (route) => {
    started?.();
    await pending;
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: '{"response":"Câu trả lời của hội thoại cũ"}\n',
    });
  });

  await page.goto('/ai-assistant');
  await sendQuestion(page);
  await requested;

  await page.getByRole('button', { name: 'Làm mới hội thoại', exact: true }).click();
  release?.();

  await expect(page.locator('.ai-chat-textarea')).toBeEnabled();
  await expect(page.locator('.ai-chat-messages')).not.toContainText('Câu trả lời của hội thoại cũ');
});

test('standard cloud LLM response is labelled Cloud LLM with citations', async ({ page }) => {
  await page.route('**/query/stream', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          response: 'Quy trình kiểm định yêu cầu tuân thủ Nghị định 98.',
          answer_source: 'llm',
          references: [
            {
              documentTitle: 'Nghị định 98/2021/NĐ-CP',
              sectionTitle: 'Điều 30',
              fileName: 'nd98.pdf',
              excerpt: 'Quy định về kiểm định trang thiết bị y tế...',
            },
          ],
        }) + '\n',
    }),
  );

  await page.goto('/ai-assistant');
  await sendQuestion(page, 'Quy trình kiểm định thiết bị y tế');

  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage).toContainText('Nghị định 98');
  await expect(assistantMessage.locator('.ai-source-tag')).toHaveText('Cloud LLM');
  await expect(assistantMessage.locator('.ai-message-references')).toBeVisible();
  const refItem = assistantMessage.locator('.ai-reference-item');
  await expect(refItem).toContainText('Nghị định 98/2021/NĐ-CP');
  await expect(refItem).toContainText('Điều 30');
  await expect(refItem).toContainText('nd98.pdf');
});

test('unknown source must remain neutral', async ({ page }) => {
  await page.route('**/query/stream', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: '{"response":"Kết quả chưa xác định nguồn"}\n',
    }),
  );

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  await expect(page.locator('.ai-chat-textarea')).toBeEnabled();
  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage).toContainText('Kết quả chưa xác định nguồn');
  await expect(assistantMessage.locator('.ai-source-tag')).not.toHaveText('Cloud LLM');
  await expect(assistantMessage.locator('.ai-source-tag')).toHaveText('Máy chủ AI');
  await expect(page.locator('.ai-status-indicator')).toContainText('Máy chủ AI');
});

test('interrupted stream response must display incomplete warning and re-enable input', async ({ page }) => {
  await page.route('**/query/stream', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: '{"response":"Nội dung mới nhận được một phần","answer_source":"llm"}\n{"error":"stream interrupted"}\n',
    }),
  );

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  await expect(page.locator('.ai-chat-textarea')).toBeEnabled();
  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage).toContainText('Nội dung mới nhận được một phần');
  await expect(assistantMessage).toContainText(/gián đoạn|chưa hoàn tất|không đầy đủ/i);
});

test('backend snake-case citations must populate source cards with title, section and file', async ({ page }) => {
  await page.route('**/query/stream', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          response: 'Căn cứ theo tài liệu quy chuẩn [1].',
          answer_source: 'llm',
          references: [
            {
              reference_id: 'qa-1',
              document_title: 'Tài liệu QA chuẩn backend',
              section_title: 'Mục thử nghiệm',
              file_path: 'qa.txt',
            },
          ],
        }) + '\n',
    }),
  );

  await page.goto('/ai-assistant');
  await sendQuestion(page);

  await expect(page.locator('.ai-chat-textarea')).toBeEnabled();
  const assistantMessage = page.locator('.ai-message-row.assistant').last();
  await expect(assistantMessage.locator('.ai-source-tag')).toHaveText('Cloud LLM');
  const refItem = assistantMessage.locator('.ai-reference-item');
  await expect(refItem).toBeVisible();
  await expect(refItem).toContainText('Tài liệu QA chuẩn backend');
  await expect(refItem).toContainText('Mục thử nghiệm');
  await expect(refItem).toContainText('qa.txt');
});

test('navigating away during in-flight stream aborts cleanly', async ({ page }) => {
  let started: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });

  await page.route('**/query/stream', async () => {
    started?.();
  });

  await page.goto('/ai-assistant');
  await sendQuestion(page);
  await requested;

  await page.goto('/');
  await expect(page).not.toHaveURL(/\/ai-assistant/);
});

