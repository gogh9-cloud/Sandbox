import OpenAI from "openai";
import { SEARCH_MARK, parseEditBlocks, applyEdits } from './codeEdits.js';

// Express(Cloud Functions)와 순수 Node 응답 객체(Vite 개발 서버) 양쪽에서 동작하도록 직접 응답한다.
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function handleChat(req, res, apiKey) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  if (!apiKey) {
    return sendJson(res, 500, { error: 'OPENAI_API_KEY is not set.' });
  }

  const messages = req.body?.messages;
  const htmlCode = req.body?.htmlCode;
  if (!messages || !Array.isArray(messages)) {
    return sendJson(res, 400, { error: 'Invalid request body' });
  }

  // 스트리밍 헤더를 즉시 전송해서 첫 바이트 대기로 연결이 끊기는 것을 막는다.
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no',
    'Cache-Control': 'no-cache, no-transform',
    'X-Content-Type-Options': 'nosniff',
  });

  try {
    const openai = new OpenAI({ apiKey });
    
    let systemPrompt = `너는 초등학교 6학년을 가르치는 친절하고 상냥한 인공지능 학습 튜터야.
 
 [중요 역할 및 학습 지도 범위]
 1. 학생의 모든 과목(국어, 수학, 사회, 과학, 영어, 코딩 등)과 학습 전반을 친절하게 돕는 인공지능 튜터야.
 2. 코딩 질문뿐만 아니라 교과 개념 설명, 수학 문제 풀이 과정 설명, 글쓰기 및 독해 지도, 역사/사회 개념, 공부 방법 상담 등 학습에 관한 모든 질문에 초등학생 눈높이에 맞춰 친절하고 이해하기 쉽게 답변해줘.
 3. [코드는 학생이 만들어 달라고 할 때만 - 가장 중요한 규칙] \`\`\`html 코드 블록은 학생의 "가장 최근 메시지"가 코드를 만들거나 고쳐 달라고 분명하게 부탁할 때에만 출력해.
    - 부탁으로 보는 말: "만들어 줘", "코드 줘", "고쳐 줘", "바꿔 줘", "추가해 줘", "수정해 줘", "다시 써 줘", "코드가 안 보여요" 같은 말. 그리고 네가 바로 앞에서 "만들어 볼까요?", "고쳐 드릴까요?"라고 물었을 때 학생이 "네", "좋아요", "해 주세요"라고 답한 경우.
    - 부탁이 아닌 말: 질문("이건 왜 이래요?", "어떻게 움직여요?"), 느낌이나 문제만 말하기("공이 너무 빨라요", "점수가 안 올라가요"), 아이디어만 말하기("아이템이 있으면 좋겠어요"), 기획 질문에 대한 대답, 인사와 잡담, 교과 학습 질문.
    - 부탁이 아닌 말에는 코드 블록 없이 글로만 답해. 고치거나 만들 만한 것이 있으면 무엇을 어떻게 바꿀지 한두 문장으로 설명하고, 마지막에 "이렇게 바꿔 드릴까요?"처럼 물어본 뒤 학생의 대답을 기다려.
    - 아래의 다른 어떤 규칙도 이 규칙보다 앞서지 않아.

 [중요 수식 및 분수 표기 규칙 (LaTeX 금지)]
 1. LaTeX 수식 기호(예: \\frac{a}{b}, \\div, \\times, \\( ... \\), \\[ ... \\])를 절대로 사용하지 마. 학생 화면에서 깨진 수식 코드로 표시될 수 있어.
 2. 수학 수식이나 분수를 설명할 때는 초등학생이 쉽게 읽을 수 있는 일반 기호와 한글 표기를 사용해줘.
    - 예시: "a/b ÷ c/d", "a/b × d/c", "1/2 (2분의 1)", "3/4 (4분의 3)" 처럼 일반 슬래시(/)와 연산 기호(×, ÷, +, -)를 사용해 친절하게 작성해줘.

 [중요 이미지 분석 및 학습 지원 규칙]
 1. 학생이 코딩 오류 스크린샷이나 코드 에러 이미지를 함께 첨부하거나 붙여넣었을 때:
    - 이미지 속에 보이는 에러 메시지, 콘솔 로그, 오타, 코드 구조 등을 꼼꼼히 파악해줘.
    - 무슨 이유로 오류가 났는지 친절하게 원인을 먼저 설명해줘. 학생이 고쳐 달라고 부탁했다면 이어서 오류가 수정된 전체 HTML/CSS/JS 코드를 \`\`\`html ... \`\`\` 마크다운 블록으로 제공하고, 부탁하지 않았다면 "고쳐 드릴까요?"라고 물어봐.
 2. 학생이 수학 문제 이미지나 교과서/문제집 스크린샷을 첨부하거나 붙여넣었을 때:
    - 이미지 속 문제 상황과 식, 수식을 정확하게 읽어내어 초등학생 눈높이에 맞게 차근차근 단계별(Step-by-step)로 풀이 과정과 정답을 다정하게 해설해줘.
    - 힌트나 핵심 개념을 짚어주어 학생이 스스로 이해할 수 있게 도와줘. 불필요한 코드 블록은 작성하지 마.

 [중요 행동 강령: 말투 및 호칭 규칙 (경어 사용 및 사과 금지)]
 1. 학생과 대화할 때는 초등학생 눈높이에 맞춰 친근하고 다정한 존댓말(예: 해요체, "~해 볼까요?", "~요" 등)을 사용해. 너무 딱딱한 격식체(예: "~이신가요?", "~하십시오")나 차가운 문체 대신, 따뜻하고 부드럽게 설명해줘. (단, 과도한 극존칭은 지양하고 반말은 사용하지 마.)
 2. 미안하다거나 죄송하다는 사과의 표현(예: "미안해요", "죄송합니다", "실수했네요", "미안해", "죄송해" 등)은 절대로 사용하지 마. 학생의 요구나 오류 지적에 대해 사과하는 대신, "설명을 보완해 볼게요", "이 부분을 더 쉽게 풀어 드릴게요" 등 해결책이나 개선 방향을 긍정적이고 자신감 있게 제시해.
 
 [중요 기획 원칙: PID(Project Intent & Description) 작성 유도 (코딩/프로젝트 요청 시)]
 학생이 "게임 만들어줘", "웹사이트 만들어줘" 처럼 막연하게 코딩 결과물을 요구하면, 절대 바로 코드를 작성해주지 마.
 대신, 학생에게 어떤 기능이나 규칙, 디자인이 필요한지 구체적으로 역질문을 던져 대화해.
 주의사항: 한 번에 여러 개의 질문을 쏟아내지 말고, 가장 핵심적인 질문을 "하나씩만" 물어보고 학생의 대답을 기다려.
 기획안(PID)이 충분히 만들어지면 바로 코드를 쓰지 말고, 정해진 내용을 2~4줄로 정리해서 보여 준 뒤 "이대로 코드를 만들어 볼까요?"라고 물어봐. 학생이 만들어 달라고 답한 다음에만 코드를 작성해.
 단, 학생이 처음부터 필요한 내용을 자세히 적고 "바로 만들어 줘"라고 분명하게 부탁했다면 되묻지 말고 코드를 작성해.
 
 [코드 작성 규칙 - 학생이 코딩이나 웹/게임 프로젝트 생성을 요청한 경우에 적용]
 1. 코드를 작성해줄 때는, 오직 순수한 HTML/CSS/JS 코드만 \`\`\`html ... \`\`\` 마크다운 블록 안에 작성해서 응답해.
 2. HTML 코드 안에는 반드시 <style> 태그로 CSS를 넣고, 자바스크립트가 필요하면 <script> 태그로 넣어.
 3. 새로 만드는 코드는 생략이나 중간에 끊김 없이 완성된 전체 코드를 끝까지 전부 작성해줘. 코드는 들여쓰기와 줄바꿈을 지켜 읽기 쉽게 쓰고, 초등학생이 이해할 수 있도록 중요한 부분에만 짧은 한글 주석을 달아줘.
 4. 학생이 기존 코드의 수정이나 새 기능 추가를 분명하게 부탁하거나, "코드 주세요", "코드가 안 보여요", "다시 작성해줘" 등 코드를 요구하면 절대로 설명만 하고 멈추지 마. 새로 만드는 경우에는 전체 코드를 \`\`\`html ... \`\`\` 블록으로, 기존 코드를 고치는 경우에는 아래 [기존 코드 수정 방식]의 편집 블록으로 반드시 응답해.
 5. "아래 코드를 확인해 보세요", "수정된 코드를 작성했어요" 등 코드를 제공함을 시사하는 문장을 말하거나 의도했다면, 그 즉시 \`\`\`html 코드 블록이나 편집 블록을 출력해야 해. 말만 해놓고 누락하는 것은 엄격히 금지된다.
 6. 기존 코드를 수정할 때는 학생이 부탁한 부분만 정확하게 골라서 고쳐. 이미 잘 작동하던 기능이나 디자인, 설정(예: 캐릭터 크기, 속도, 색상, 점수 등)을 마음대로 바꾸거나 빠뜨리면 안 돼.
 7. 코드를 줄 때는 간단한 설명(1~2문장)을 먼저 하고, 바로 이어서 코드 블록이나 편집 블록을 출력해. 설명과 코드 사이에 불필요한 긴 설명을 넣지 마.
 8. 특히 게임이나 그래픽을 만들 때는 우측 프리뷰 화면(iframe)에 꽉 차고 잘리지 않도록 반응형(responsive)으로 만들어줘. 스크롤바가 안 생기게 \`body { margin: 0; overflow: hidden; }\`를 넣고 캔버스 크기를 화면에 맞게 자동 조절해줘.

 [기존 코드 수정 방식 - 편집 블록]
 [현재 학생 화면의 최신 코드]가 있고 학생이 그 코드의 수정이나 기능 추가를 부탁하면, 전체 코드를 다시 쓰지 말고 바뀌는 부분만 아래 형식의 편집 블록으로 출력해. 시스템이 편집 블록을 현재 코드에 자동으로 적용해.
<<<<<<< SEARCH
(현재 코드에서 바꿀 부분의 줄들을 그대로 복사)
=======
(바꾼 뒤의 줄들)
>>>>>>> REPLACE
 - SEARCH에는 현재 코드에 실제로 있는 줄을 공백과 들여쓰기까지 글자 그대로 복사해. 줄을 생략하거나 "..."으로 줄이지 마.
 - SEARCH 내용은 현재 코드에서 딱 한 군데만 가리켜야 해. 같은 내용이 여러 곳에 있으면 앞뒤 줄을 더 넣어서 한 군데만 가리키게 해. 대신 꼭 필요한 줄만 넣어서 짧게 유지해.
 - 새 코드를 끼워 넣을 때는 끼워 넣을 자리 바로 앞의 줄을 SEARCH에 넣고, REPLACE에 그 줄과 새 코드를 함께 써.
 - 여러 곳을 고칠 때는 편집 블록을 여러 개 써. 블록끼리 같은 줄을 겹쳐서 고치면 안 돼.
 - 편집 블록은 \`\`\` 코드펜스로 감싸지 마. 편집 블록을 쓸 때는 \`\`\`html 전체 코드 블록을 함께 출력하지 마.
 - 무엇을 바꿨는지 1~2문장으로 먼저 설명한 다음 편집 블록을 쓰고, 편집 블록 뒤에는 아무것도 쓰지 마. 학생에게는 "편집 블록"이라는 말을 하지 마.
 - 다음 경우에만 편집 블록 대신 전체 코드를 \`\`\`html 블록으로 써: 현재 코드가 없을 때, 지금 것과 완전히 다른 새 작품을 만들 때, 학생이 "코드 주세요", "코드가 안 보여요", "처음부터 다시 써 줘"라고 할 때, 코드의 절반 이상이 바뀔 때.
 
 [거절 및 답변 규칙]
 1. 학생이 학습 및 교과와 무관한 유해하거나 비윤리적인 질문을 하면 "저는 올바른 학습과 코딩을 돕는 튜터예요."라고 친절하게 거절해.
 2. 일반 학습 질문 답변이나 기획 대화 중에는 초등학생 눈높이에 맞춰 다정하고 명쾌하게 2~4문장 이내로 이해하기 쉽게 대답해줘.`;

    const currentCode = htmlCode && typeof htmlCode === 'string' && !htmlCode.includes('안녕하세요! 여기는 프리뷰 화면이에요!')
      ? htmlCode.replace(/\r\n/g, '\n').trim()
      : '';
    if (currentCode) {
      systemPrompt += `\n\n[현재 학생 화면(샌드박스 프리뷰)에 적용되어 있는 최신 코드]\n\`\`\`html\n${currentCode}\n\`\`\`\n위 코드는 참고용이야. 학생이 수정을 분명하게 부탁했을 때에만 [기존 코드 수정 방식]에 따라 편집 블록으로 고쳐줘. 부탁하지 않았다면 이 코드를 다시 출력하지 마.`;
    }

    // 과거 턴에 들어있던 완성 코드 블록은 htmlCode로 이미 최신본이 전달되므로
    // 히스토리 전송 시에는 제거해서 분당 토큰(TPM) 사용량을 크게 줄인다.
    const CODE_BLOCK_REGEX = /```[a-zA-Z]*\s*[\s\S]*?```/g;
    const CODE_PLACEHOLDER = '[이전에 생성했던 코드는 생략되었어요. 최신 코드는 위 "현재 학생 화면" 코드를 참고하세요.]';
    const stripCodeBlocks = (text) => {
      if (typeof text !== 'string' || !text.includes('```')) return text;
      return text.replace(CODE_BLOCK_REGEX, CODE_PLACEHOLDER).trim();
    };

    // Remove the initial AI welcome message (id === 1) if present
    let filteredMessages = [...messages];
    if (filteredMessages.length > 0 && filteredMessages[0].id === 1) {
      filteredMessages = filteredMessages.slice(1);
    }

    // OpenAI Message formatting helper
    const buildOpenAiMessages = (historyLimit) => {
      const windowed = filteredMessages.slice(-historyLimit);
      const lastIndex = windowed.length - 1;
      const formatMessageContent = (msg, isLast) => {
        let textPart = msg.fullText || msg.text || '';
        if (msg.sender !== 'user' && !isLast) {
          textPart = stripCodeBlocks(textPart);
        }
        if (msg.image && msg.image.data && msg.image.mimeType) {
          return [
            { type: 'text', text: textPart },
            {
              type: 'image_url',
              image_url: {
                url: `data:${msg.image.mimeType};base64,${msg.image.data}`,
              },
            },
          ];
        }
        return textPart;
      };

      return [
        { role: 'system', content: systemPrompt },
        ...windowed.map((msg, idx) => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: formatMessageContent(msg, idx === lastIndex),
        })),
      ];
    };

    // 출력 한도에는 모델이 답하기 전에 쓰는 추론 토큰도 포함된다.
    const MODEL = 'gpt-6.1-sol';
    const MAX_OUTPUT_TOKENS = 16000;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // 429 에러를 두 종류로 구분해서 대응한다.
    // 1) "Request too large": 이 요청 자체가 혼자서도 한도(TPM)를 넘음 -> 히스토리를 줄여서 재시도
    // 2) 그 외 rate limit: 같은 시간에 다른 학생들이 몰려 분당 예산이 일시적으로 소진됨
    //    -> 요청 크기는 그대로 두고, 안내된 대기시간만큼 기다렸다가 같은 요청을 재시도
    const HISTORY_LIMITS = [20, 8, 3];
    const MAX_ATTEMPTS = 5;
    let historyIdx = 0;

    const createStream = async (extraMessages = []) => {
      let lastErr;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          return await openai.chat.completions.create({
            model: MODEL,
            messages: [
              ...buildOpenAiMessages(HISTORY_LIMITS[Math.min(historyIdx, HISTORY_LIMITS.length - 1)]),
              ...extraMessages,
            ],
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: MAX_OUTPUT_TOKENS,
          });
        } catch (err) {
          lastErr = err;
          const message = err?.message || String(err);
          const isRateLimited = err?.status === 429 || /rate_limit|tokens per min/i.test(message);
          if (!isRateLimited) break;

          if (/request too large/i.test(message)) {
            historyIdx += 1;
          } else {
            const waitMatch = message.match(/try again in ([\d.]+)\s*s/i);
            const waitSeconds = waitMatch ? Math.min(parseFloat(waitMatch[1]) + 0.5, 15) : Math.min(2 * (attempt + 1), 10);
            await sleep(waitSeconds * 1000);
          }
        }
      }
      throw lastErr;
    };

    // 비용 확인용 기록 (Cloud Functions 로그에서 chat_usage 로 검색)
    const logUsage = (mode, usage) => {
      if (!usage) return;
      console.log(JSON.stringify({
        tag: 'chat_usage',
        model: MODEL,
        mode,
        prompt_tokens: usage.prompt_tokens,
        cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        completion_tokens: usage.completion_tokens,
      }));
    };

    // 학생에게 그대로 흘려보내다가, 편집 블록이 시작되면 그 뒤는 모아 두었다가 현재 코드에 적용한다.
    let streamedText = '';
    let editBuffer = null;
    let heldFence = null;
    let lineBuf = '';
    let linePassthrough = false;
    let usage = null;

    const emit = (text) => {
      if (!text) return;
      streamedText += text;
      res.write(text);
    };
    const couldBeSpecial = (t) => t === '' || SEARCH_MARK.startsWith(t) || t.startsWith(SEARCH_MARK) || /^`{1,3}[a-zA-Z]*$/.test(t);
    const handleLine = (line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(SEARCH_MARK)) {
        heldFence = null; // 편집 블록을 감싼 코드펜스는 버린다
        editBuffer = line;
        return;
      }
      if (heldFence !== null) {
        emit(heldFence);
        heldFence = null;
      }
      if (/^```[a-zA-Z]*$/.test(trimmed)) {
        heldFence = line;
        return;
      }
      emit(line);
    };
    const feed = (text) => {
      if (!currentCode) {
        emit(text);
        return;
      }
      let rest = text;
      while (rest) {
        if (editBuffer !== null) {
          editBuffer += rest;
          return;
        }
        const nl = rest.indexOf('\n');
        const piece = nl >= 0 ? rest.slice(0, nl + 1) : rest;
        rest = rest.slice(piece.length);
        if (linePassthrough) {
          emit(piece);
          if (nl >= 0) linePassthrough = false;
          continue;
        }
        lineBuf += piece;
        if (nl >= 0) {
          handleLine(lineBuf);
          lineBuf = '';
        } else if (!couldBeSpecial(lineBuf.trimStart())) {
          if (heldFence !== null) {
            emit(heldFence);
            heldFence = null;
          }
          emit(lineBuf);
          lineBuf = '';
          linePassthrough = true;
        }
      }
    };

    for await (const chunk of await createStream()) {
      if (chunk.usage) usage = chunk.usage;
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) feed(content);
    }
    if (lineBuf) handleLine(lineBuf);
    if (editBuffer === null && heldFence !== null) emit(heldFence);

    if (editBuffer === null) {
      logUsage(streamedText.includes('```') ? 'full' : 'text', usage);
      res.end();
      return;
    }

    const { blocks, complete } = parseEditBlocks(editBuffer);
    const applied = complete ? applyEdits(currentCode, blocks) : { ok: false, reason: 'incomplete edit blocks' };
    if (applied.ok) {
      logUsage('edit', usage);
      res.write(`\n\n\`\`\`html\n${applied.code}\n\`\`\`\n`);
      res.end();
      return;
    }

    // 편집을 적용할 수 없으면 같은 수정 내용을 전체 코드로 다시 받는다 (설명은 이미 전달했으므로 코드만).
    console.warn(`Edit blocks could not be applied (${applied.reason}); falling back to full code.`);
    logUsage('edit_failed', usage);
    let fallbackUsage = null;
    res.write('\n\n');
    const fallbackStream = await createStream([
      { role: 'assistant', content: `${streamedText}\n${editBuffer}` },
      { role: 'system', content: '위 편집 블록은 현재 코드에 적용할 수 없었어. 같은 수정 내용을 모두 반영한 전체 코드를 ```html 블록 하나로만 출력해. 설명이나 편집 블록은 쓰지 마.' },
    ]);
    for await (const chunk of fallbackStream) {
      if (chunk.usage) fallbackUsage = chunk.usage;
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) res.write(content);
    }
    logUsage('edit_fallback_full', fallbackUsage);
    res.end();
  } catch (e) {
    console.error("Stream error:", e);
    const errMessage = e.message || String(e);
    res.write(`[API_ERROR: ${errMessage}]`);
    res.end();
  }
}