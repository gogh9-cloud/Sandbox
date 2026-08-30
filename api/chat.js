/* global process */
import OpenAI from "openai";

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set in environment variables.' });
  }

  const messages = req.body?.messages;
  const htmlCode = req.body?.htmlCode;
  const violationCount = req.body?.violationCount || 0;
  const banmalCount = req.body?.banmalCount || 0;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // 스트리밍 헤더를 즉시 전송 — 이 시점에서 Vercel Gateway 타임아웃(TTFB 10초) 해결
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
 3. 학생이 코딩이나 웹/게임 작성을 요청하지 않은 일반 학습 질문을 했을 때는 불필요하게 HTML 코드 블록을 생성하지 마.

 [중요 이미지 분석 및 학습 지원 규칙]
 1. 학생이 코딩 오류 스크린샷이나 코드 에러 이미지를 함께 첨부하거나 붙여넣었을 때:
    - 이미지 속에 보이는 에러 메시지, 콘솔 로그, 오타, 코드 구조 등을 꼼꼼히 파악해줘.
    - 무슨 이유로 오류가 났는지 친절하게 원인을 먼저 설명한 뒤, 오류가 완벽히 수정된 전체 HTML/CSS/JS 코드를 \`\`\`html ... \`\`\` 마크다운 블록으로 제공해줘.
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
 학생과의 대화를 통해 구체적인 기획안(PID)이 충분히 만들어졌을 때 코딩을 시작해.
 
 [코드 작성 규칙 - 학생이 코딩이나 웹/게임 프로젝트 생성을 요청한 경우에 적용]
 1. 코드를 작성해줄 때는, 오직 순수한 HTML/CSS/JS 코드만 \`\`\`html ... \`\`\` 마크다운 블록 안에 작성해서 응답해.
 2. HTML 코드 안에는 반드시 <style> 태그로 CSS를 넣고, 자바스크립트가 필요하면 <script> 태그로 넣어.
 3. 코딩을 할 때는 생략이나 중간에 끊김 없이 무조건 완성된 전체 코드를 끝까지 전부 다 작성해줘. 단, 서버 타임아웃을 예방하고 전송 속도를 높이기 위해 코드 내의 불필요한 주석은 완전히 제외하고, 공백과 개행(줄바꿈)은 최소한으로 사용하여 최대한 간결하고 컴팩트하게 작성해야 해. (매우 중요)
 4. 학생이 기존 코드의 수정, 새 기능 추가, 또는 "코드 주세요", "코드가 안 보여요", "다시 작성해줘" 등 코드를 요구하면 절대로 설명만 하고 멈추지 마. 무조건 완성된 전체 코드를 \`\`\`html ... \`\`\` 마크다운 블록 안에 포함해서 응답해.
 5. "아래 코드를 확인해 보세요", "수정된 코드를 작성했어요" 등 코드를 제공함을 시사하는 문장을 말하거나 의도했다면, 그 즉시 무조건 \`\`\`html 코드 블록을 출력해야 해. 말만 해놓고 코드 블록을 누락하는 것은 엄격히 금지된다.
 6. 기존 코드 수정 시 원본 유지 및 부분 수정 규칙 (매우 중요):
    - 학생이 이전 코드의 수정을 요청할 때, 코드를 처음부터 완전히 새로 작성하면서 기존에 이미 잘 작동하던 기능이나 디자인, 설정(예: 캐릭터 크기, 속도, 색상, 점수 등)을 무단으로 변경하거나 누락해서는 안 돼.
    - 대화 내역이나 아래 제공된 [현재 학생 화면의 최신 코드]를 꼼꼼히 참조하여, 학생이 수정을 요구한 특정 부분만 정확하게 골라서 수정해야 해. 그 외의 모든 HTML 구조, CSS 스타일, JavaScript 변수 및 로직은 기존 코드와 100% 동일하게 유지해줘.
    - 코드를 출력하기 전에 기존 코드와 비교하여 요청하지 않은 부분이 임의로 변경되었거나 유실되었는지 스스로 검증하고 수정본 전체 코드를 제공해줘.
 7. 코드를 줄 때는 간단한 설명(1~2문장)을 먼저 하고, 바로 이어서 \`\`\`html 코드 블록을 출력해. 설명과 코드 사이에 불필요한 긴 설명을 넣지 마.
 8. 특히 게임이나 그래픽을 만들 때는 우측 프리뷰 화면(iframe)에 꽉 차고 잘리지 않도록 반응형(responsive)으로 만들어줘. 스크롤바가 안 생기게 \`body { margin: 0; overflow: hidden; }\`를 넣고 캔버스 크기를 화면에 맞게 자동 조절해줘.
 
 [거절 및 답변 규칙]
 1. 학생이 학습 및 교과와 무관한 유해하거나 비윤리적인 질문을 하면 "저는 올바른 학습과 코딩을 돕는 튜터예요."라고 친절하게 거절해.
 2. 일반 학습 질문 답변이나 기획 대화 중에는 초등학생 눈높이에 맞춰 다정하고 명쾌하게 2~4문장 이내로 이해하기 쉽게 대답해줘.`;

    if (htmlCode && typeof htmlCode === 'string' && htmlCode.trim() && !htmlCode.includes('안녕하세요! 여기는 프리뷰 화면이에요!')) {
      systemPrompt += `\n\n[현재 학생 화면(샌드박스 프리뷰)에 적용되어 있는 최신 코드]\n\`\`\`html\n${htmlCode.trim()}\n\`\`\`\n학생이 수정을 요구하거나 코드를 다시 작성해달라고 하면, 반드시 위 코드를 바탕으로 수정을 진행하고 수정본 전체 코드를 \`\`\`html ... \`\`\` 블록으로 작성해줘.`;
    }

    // OpenAI Message formatting helper
    const formatMessageContent = (msg) => {
      const textPart = msg.fullText || msg.text || '';
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

    // Remove the initial AI welcome message (id === 1) if present
    let filteredMessages = [...messages];
    if (filteredMessages.length > 0 && filteredMessages[0].id === 1) {
      filteredMessages = filteredMessages.slice(1);
    }

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...filteredMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: formatMessageContent(msg),
      })),
    ];

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: openAiMessages,
      stream: true,
      max_tokens: 16384,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(content);
      }
    }
    res.end();
  } catch (e) {
    console.error("Stream error:", e);
    const errMessage = e.message || String(e);
    res.write(`[API_ERROR: ${errMessage}]`);
    res.end();
  }
}