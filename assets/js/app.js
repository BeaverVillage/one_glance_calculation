(() => {
  const TOOL_DRAWER_GROUPS = [
    {
      label: '차량 생활 확인',
      tools: [
        ['전기차 충전소 지도', '/tools/ev-charger-map.html', '목적지 주변 충전소 상태와 사용 가능성 확인'],
        ['주차비 확인 지도', '/tools/parking-fee-check.html', '목적지 주변 주차장 요금과 운영정보 확인'],
      ]
    },
    {
      label: '생활 지도',
      tools: [
        ['공중화장실 찾기', '/tools/public-toilet-map.html', '전국 공중화장실 위치, 개방시간, 편의시설 확인'],
        ['무료 와이파이 찾기', '/tools/free-wifi-map.html', '전국 무료 와이파이 위치, 와이파이 이름과 시설구분 확인'],
        ['낚시터 찾기', '/tools/fishing-spot-map.html', '전국 낚시터 위치, 어종, 요금, 전화번호 확인'],
      ]
    },
    {
      label: '생활 안전·의료 확인',
      tools: [
        ['외출 위험 종합 체크', '/tools/outdoor-air.html', '대기질·날씨·자외선과 활동별 외출 위험도 확인'],
        ['응급실·야간 병원 확인', '/tools/emergency-hospital-check.html', '응급실·야간 병원·약국 전화 확인 참고']
      ]
    },
    {
      label: '생활 물가 확인',
      tools: [
        ['장보기 물가 확인', '/tools/grocery-price-check.html', '농수축산물과 생필품 가격 흐름 확인']
      ]
    },
    {
      label: '사업자·거래 확인',
      tools: [
        ['사업자등록 상태 조회', '/tools/business-status.html', '계속·휴업·폐업 여부와 과세유형 확인'],
        ['사업자 진위확인', '/tools/business-validate.html', '대표자명과 개업일자 일치 여부 확인'],
        ['통신판매업 신고 조회', '/tools/mail-order.html', '온라인 판매자 공개 신고정보 확인'],
        ['쇼핑몰 정보 비교', '/tools/store-compare.html', '사이트 하단 정보와 공식 정보 비교'],
        ['거래 전 체크리스트', '/tools/pre-payment-checklist.html', '입금 전 확인할 항목을 한 번에 정리']
      ]
    },
    {
      label: '기기 확인',
      tools: [
        ['컴퓨터 사양 확인', '/tools/pc-spec.html', '운영체제·CPU 코어·메모리·GPU·화면 정보 확인'],
        ['CPU 간단 테스트', '/tools/pc-spec.html#pc-spec-tool', '브라우저 안에서 짧은 반복 연산으로 참고 성능 확인']
      ]
    },
    {
      label: '해석 가이드',
      tools: [
        ['사업자등록 상태 조회 가이드', '/guides/business-registration-status.html', '상태 결과를 어떻게 읽어야 하는지 안내'],
        ['계속·휴업·폐업자 차이', '/guides/active-closed-business.html', '상태별 의미와 추가 확인 포인트'],
        ['통신판매업 신고정보 가이드', '/guides/mail-order-business.html', '신고정보 확인 시 주의할 점'],
        ['무통장입금 전 확인사항', '/guides/before-bank-transfer.html', '입금 전에 추가로 봐야 할 기준 설명'],
        ['공식 정보가 정상이어도 주의할 점', '/guides/official-info-limit.html', '등록정보와 거래 안전성의 차이 설명']
      ]
    }
  ];

  initToolDrawer();
  initPcSpecTool();


  function initToolDrawer() {
    if (document.querySelector('.tool-drawer')) return;

    const drawerEscape = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const drawer = document.createElement('aside');
    drawer.className = 'tool-drawer';
    drawer.setAttribute('aria-label', '한눈체크 주요 기능');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `
      <div class="tool-drawer-head">
        <div>
          <strong>주요 기능</strong>
          <small>필요한 확인 기능을 바로 선택하세요.</small>
        </div>
        <button type="button" class="tool-drawer-close" aria-label="주요 기능 닫기">×</button>
      </div>
      <div class="tool-search-row">
        <span aria-hidden="true">⌕</span>
        <input type="search" id="tool-search" placeholder="기능 검색..." autocomplete="off">
      </div>
      <nav class="tool-drawer-list" aria-label="한눈체크 기능 목록">
        ${TOOL_DRAWER_GROUPS.map((group) => `
          <section class="tool-group">
            <h2>${drawerEscape(group.label)}</h2>
            ${group.tools.map(([name, href, desc]) => `
              <a href="${href}" data-tool-name="${drawerEscape((name + ' ' + desc).toLowerCase())}">
                <strong>${drawerEscape(name)}</strong>
                <small>${drawerEscape(desc)}</small>
              </a>
            `).join('')}
          </section>
        `).join('')}
      </nav>
    `;

    const backdrop = document.createElement('button');
    backdrop.className = 'drawer-backdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', '주요 기능 닫기');

    document.body.append(drawer, backdrop);

    const openDrawer = () => {
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
      if (!window.matchMedia('(max-width: 720px)').matches) {
        drawer.querySelector('#tool-search')?.focus();
      }
    };

    const closeDrawer = () => {
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('drawer-open');
    };

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest('[data-tool-drawer], .site-nav a[href$="#features"]');
      if (!trigger) return;
      event.preventDefault();
      openDrawer();
    });

    drawer.querySelector('.tool-drawer-close')?.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });

    drawer.querySelector('#tool-search')?.addEventListener('input', (event) => {
      const query = event.target.value.trim().toLowerCase();
      drawer.querySelectorAll('[data-tool-name]').forEach((link) => {
        const visible = !query || link.dataset.toolName.includes(query);
        link.hidden = !visible;
      });
    });
  }



  function initPcSpecTool() {
    const root = document.querySelector('#pc-spec-tool');
    if (!root) return;

    const escape = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const autoGrid = document.querySelector('#auto-spec-grid');
    const refreshButton = document.querySelector('#pc-refresh-button');
    const autoGpuInput = document.querySelector('#auto-gpu-manual');
    const autoSpecInterpretButton = document.querySelector('#auto-spec-interpret-button');
    const cpuTestButton = document.querySelector('#cpu-test-button');
    const benchmarkBox = document.querySelector('#benchmark-box');
    const benchmarkBar = document.querySelector('#benchmark-bar');
    const benchmarkResult = document.querySelector('#benchmark-result');
    const cpuTestStatus = document.querySelector('#cpu-test-status');
    const manualForm = document.querySelector('#manual-spec-form');
    const imageInput = document.querySelector('#spec-image-input');
    const ocrStatus = document.querySelector('#ocr-status');
    const modal = document.querySelector('#spec-help-modal');
    const modalPanel = modal?.querySelector('.help-modal-panel');
    const modalEyebrow = document.querySelector('#spec-help-eyebrow');
    const modalTitle = document.querySelector('#spec-help-title');
    const modalBody = document.querySelector('#spec-help-body');
    const modalClose = document.querySelector('#spec-help-close');

    let lastAutoSpecs = null;

    const helpContents = {
      cpu: {
        title: 'CPU 모델명은 어디서 보나요?',
        body: `
          <ul class="info-bullet-list">
            <li><strong>Windows:</strong> 설정 → 시스템 → 정보에서 프로세서 항목을 확인합니다. 작업 관리자 → 성능 → CPU에서도 볼 수 있습니다.</li>
            <li><strong>macOS:</strong>  메뉴 → 이 Mac에 관하여에서 칩 또는 프로세서 항목을 확인합니다.</li>
            <li><strong>상품 페이지:</strong> 사양표에서 CPU, Processor, 프로세서라고 적힌 항목을 복사합니다.</li>
          </ul>`
      },
      ram: {
        title: 'RAM 용량은 어디서 보나요?',
        body: `
          <ul class="info-bullet-list">
            <li><strong>Windows:</strong> 설정 → 시스템 → 정보의 설치된 RAM 항목을 확인합니다.</li>
            <li><strong>macOS:</strong>  메뉴 → 이 Mac에 관하여에서 메모리 또는 통합 메모리 항목을 확인합니다.</li>
            <li><strong>상품 페이지:</strong> 메모리, RAM, Memory 항목에 표시된 GB 값을 입력합니다.</li>
          </ul>`
      },
      gpu: {
        title: 'GPU 그래픽카드는 어디서 보나요?',
        body: `
          <ul class="info-bullet-list">
            <li><strong>Windows:</strong> 작업 관리자 → 성능 → GPU에서 이름을 확인합니다. 장치 관리자 → 디스플레이 어댑터에서도 볼 수 있습니다.</li>
            <li><strong>macOS:</strong>  메뉴 → 이 Mac에 관하여에서 그래픽 또는 칩 항목을 확인합니다.</li>
            <li><strong>상품 페이지:</strong> 그래픽, GPU, VGA, Graphics 항목에 표시된 모델명을 입력합니다.</li>
          </ul>`
      },
      storage: {
        title: '저장장치는 어디서 보나요?',
        body: `
          <ul class="info-bullet-list">
            <li><strong>Windows:</strong> 작업 관리자 → 성능 → 디스크에서 SSD/HDD 여부와 용량을 확인합니다. 장치 관리자나 디스크 관리에서도 볼 수 있습니다.</li>
            <li><strong>macOS:</strong> 시스템 설정 → 일반 → 저장 공간에서 용량을 확인합니다.</li>
            <li><strong>상품 페이지:</strong> 저장장치, SSD, HDD, Storage 항목의 종류와 용량을 입력합니다.</li>
          </ul>`
      }
    };

    const showModal = ({ eyebrow = '확인 결과', title, body, wide = false }) => {
      if (!modal || !modalTitle || !modalBody) return;
      if (modalEyebrow) modalEyebrow.textContent = eyebrow;
      modalTitle.textContent = title;
      modalBody.innerHTML = body;
      modal.hidden = false;
      modalPanel?.classList.toggle('wide-result', Boolean(wide));
      document.body.classList.add('modal-open');
    };

    const closeModal = () => {
      if (!modal) return;
      modal.hidden = true;
      modalPanel?.classList.remove('wide-result');
      document.body.classList.remove('modal-open');
    };

    const getOsName = () => {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      if (/Windows/i.test(ua + platform)) return 'Windows 계열';
      if (/Macintosh|Mac OS/i.test(ua + platform)) return 'macOS 계열';
      if (/Android/i.test(ua)) return 'Android 계열';
      if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS 계열';
      if (/Linux/i.test(ua + platform)) return 'Linux 계열';
      return '확인 제한';
    };

    const getGpuInfo = () => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { value: '직접 입력 권장', detail: 'WebGL 확인이 제한되어 GPU 모델명을 직접 입력하는 것이 좋습니다.' };
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return { value: '직접 입력 권장', detail: 'WebGL은 지원하지만 GPU 모델명은 보안 설정상 표시되지 않습니다.' };
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return { value: '직접 입력 권장', detail: renderer ? `참고 WebGL 렌더러: ${renderer}` : 'GPU 모델명은 직접 입력해야 더 정확합니다.', raw: renderer || '' };
      } catch {
        return { value: '직접 입력 권장', detail: '그래픽 정보를 확인할 수 없어 직접 입력이 필요합니다.' };
      }
    };

    const parseMemory = (value) => {
      const match = String(value || '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : null;
    };

    const renderSpecCard = ({ label, value, desc, tone = 'neutral' }) => `
      <article class="spec-card ${tone}">
        <span>${escape(label)}</span>
        <strong>${escape(value)}</strong>
        <small>${escape(desc)}</small>
      </article>`;

    const collectAutoSpecs = () => {
      const gpu = getGpuInfo();
      const cores = navigator.hardwareConcurrency || null;
      const memory = navigator.deviceMemory || null;
      const width = window.screen?.width || window.innerWidth;
      const height = window.screen?.height || window.innerHeight;
      const ratio = window.devicePixelRatio || 1;
      return {
        os: getOsName(),
        cores,
        memory,
        gpu,
        screen: `${width} × ${height}`,
        pixelRatio: ratio
      };
    };

    const renderAutoSpecs = () => {
      const specs = collectAutoSpecs();
      lastAutoSpecs = specs;
      const cards = [
        { label: '운영체제 추정', value: specs.os, desc: '사용자 환경 문자열을 바탕으로 추정한 값입니다.' },
        { label: 'CPU 논리 코어', value: specs.cores ? `${specs.cores}개` : '확인 제한', desc: specs.cores ? '동시에 처리 가능한 논리 프로세서 수입니다.' : '현재 환경에서 제공되지 않습니다.', tone: specs.cores >= 8 ? 'success' : 'neutral' },
        { label: '메모리 추정', value: specs.memory ? `약 ${specs.memory}GB` : '확인 제한', desc: specs.memory ? '브라우저가 제공하는 대략적인 메모리 값입니다.' : '정확한 RAM은 직접 입력해 주세요.', tone: specs.memory >= 8 ? 'success' : 'neutral' },
        { label: 'GPU 자동 확인', value: specs.gpu.value, desc: specs.gpu.detail, tone: 'warning' },
        { label: '화면 해상도', value: specs.screen, desc: '현재 화면의 표시 해상도입니다.' },
        { label: '정확한 부품명', value: '직접 입력 필요', desc: 'CPU 모델명, GPU 모델, 저장장치 모델은 직접 입력이 더 정확합니다.', tone: 'warning' }
      ];
      autoGrid.innerHTML = cards.map(renderSpecCard).join('');
    };

    const describeNvidiaSeries = (series) => {
      if (series >= 50) return 'RTX 50 시리즈는 최신 세대에 가까운 그래픽 계열입니다. 같은 50 시리즈 안에서도 5060·5070·5080·5090처럼 뒤 두 자리 등급에 따라 체감 성능 차이가 큽니다.';
      if (series >= 40) return 'RTX 40 시리즈는 최근 세대 외장 그래픽 계열입니다. DLSS 3 계열 기능과 전력 효율이 장점인 편이며, 노트북은 전력 제한에 따라 성능 차이가 큽니다.';
      if (series >= 30) return 'RTX 30 시리즈는 아직 FHD 게임과 일반 그래픽 작업에 많이 쓰이는 외장 그래픽 계열입니다. 최신 기능과 전력 효율은 40·50 시리즈보다 제한될 수 있습니다.';
      if (series >= 20) return 'RTX 20 시리즈는 레이트레이싱을 지원하는 구형 RTX 계열입니다. 최신 게임에서는 옵션 조정이 필요할 수 있습니다.';
      return 'GTX 계열은 RTX 기능은 제한적이지만, 모델에 따라 FHD 게임과 일반 그래픽 작업에 활용할 수 있습니다.';
    };

    const classifyGpuText = (gpuText) => {
      const original = String(gpuText || '').trim();
      const text = original.toLowerCase();
      if (!original) return { label: 'GPU 확인 필요', score: 0, text: 'GPU 모델명이 명확하지 않아 게임·그래픽 작업 판단은 직접 입력값 확인이 필요합니다.' };

      const rtx = text.match(/rtx\s*(\d{2})(\d{2})\s*(ti|super)?\s*(laptop|mobile)?/i);
      if (rtx) {
        const series = Number(rtx[1]);
        const classNum = Number(rtx[2]);
        const hasLaptop = /laptop|mobile/i.test(text);
        const suffix = rtx[3] ? ` ${rtx[3].toUpperCase()}` : '';
        let label = '외장 GPU';
        let score = 1.4;
        let useCase = '내장 그래픽보다 게임·그래픽 작업에 유리합니다.';
        if (classNum >= 90) { label = '최상급 외장 GPU'; score = 3.1; useCase = '4K 게임, 고해상도 영상 편집, GPU 가속 작업까지 강한 계열입니다.'; }
        else if (classNum >= 80) { label = '상급 외장 GPU'; score = 2.7; useCase = 'QHD~4K 게임, 영상 편집, 그래픽 작업에 유리한 계열입니다.'; }
        else if (classNum >= 70) { label = '중상급 외장 GPU'; score = 2.35; useCase = 'FHD~QHD 게임과 그래픽 작업에 비교적 유리한 계열입니다.'; }
        else if (classNum >= 60) { label = '메인스트림 외장 GPU'; score = 2.05; useCase = 'FHD 게임, 일반 그래픽 작업, 영상 편집 보조에 무난한 계열입니다.'; }
        else if (classNum >= 50) { label = '보급형 외장 GPU'; score = 1.55; useCase = '가벼운 게임과 GPU 가속 보조에는 도움이 되지만, 고해상도 게임은 옵션 조정이 필요합니다.'; }
        const laptopNote = hasLaptop || /laptop/i.test(original) ? ' 노트북용 GPU는 같은 모델명이라도 TGP, 냉각 설계, 전원 모드에 따라 성능 차이가 큽니다.' : '';
        return { label, score, text: `${original}는 NVIDIA RTX ${series} 시리즈 ${classNum}급${suffix} 그래픽카드로 보입니다. ${describeNvidiaSeries(series)} 뒤 두 자리 ${classNum}은 대략적인 등급을 보는 데 쓰이며, 숫자가 클수록 같은 세대 안에서 상위 제품군에 가깝습니다. ${useCase}${laptopNote}` };
      }

      const gtx = text.match(/gtx\s*(\d{2})(\d{2})\s*(ti)?/i);
      if (gtx) {
        const series = Number(gtx[1]);
        const classNum = Number(gtx[2]);
        const score = classNum >= 60 ? 1.35 : 1.05;
        return { label: classNum >= 60 ? '구형 메인스트림 외장 GPU' : '구형 보급형 외장 GPU', score, text: `${original}는 NVIDIA GTX ${series} 시리즈 ${classNum}급 그래픽카드로 보입니다. RTX 계열의 최신 AI 프레임 생성·레이트레이싱 기능은 제한적이지만, 모델에 따라 FHD 게임과 일반 그래픽 작업에는 사용할 수 있습니다.` };
      }

      const rx = text.match(/(?:radeon\s*)?rx\s*(\d)(\d)(\d{2})\s*(xt|gre)?/i);
      if (rx) {
        const generation = Number(rx[1]);
        const classDigit = Number(rx[2]);
        let label = 'Radeon 외장 GPU';
        let score = 1.45;
        if (classDigit >= 9) { label = '상급 Radeon 외장 GPU'; score = 2.65; }
        else if (classDigit >= 8) { label = '중상급 Radeon 외장 GPU'; score = 2.25; }
        else if (classDigit >= 7) { label = '메인스트림 Radeon 외장 GPU'; score = 1.85; }
        else if (classDigit >= 6) { label = '보급형 Radeon 외장 GPU'; score = 1.35; }
        return { label, score, text: `${original}는 AMD Radeon RX ${generation}000번대 계열로 보입니다. 앞자리 ${generation}은 세대, 다음 숫자 ${classDigit}은 같은 세대 안의 대략적인 등급을 보는 데 도움이 됩니다. 게임 성능은 모델 등급, VRAM, 드라이버, 해상도에 따라 차이가 큽니다.` };
      }

      const mobileRadeon = text.match(/radeon\s*(7[68]0m|8[89]0m|graphics)/i);
      if (mobileRadeon) {
        return { label: '고성능 내장·통합 GPU', score: /780m|880m|890m/i.test(text) ? 1.15 : 0.75, text: `${original}는 AMD 내장·통합 그래픽 계열로 보입니다. Radeon 780M·880M처럼 성능이 좋은 내장 GPU는 가벼운 FHD 게임과 그래픽 가속에 쓸 수 있지만, RTX·RX 외장 GPU와는 급이 다릅니다. 메모리 듀얼채널 구성도 체감에 영향을 줍니다.` };
      }

      if (/intel\s*arc\s*(a?\d{3}|b?\d{3})|arc\s*(a?\d{3}|b?\d{3})/i.test(text)) {
        return { label: 'Intel Arc 외장·고성능 GPU', score: /770|750|580|b[57]/i.test(text) ? 1.75 : 1.2, text: `${original}는 Intel Arc 그래픽 계열로 보입니다. 게임과 그래픽 작업에 활용할 수 있지만, 체감은 드라이버와 게임별 최적화 영향을 비교적 크게 받습니다.` };
      }

      if (/iris\s*xe|intel\s*uhd|uhd\s*graphics|integrated|내장/i.test(text)) {
        return { label: '내장 GPU', score: /iris/i.test(text) ? 0.75 : 0.45, text: `${original}는 내장 그래픽 계열로 보입니다. 문서, 웹, 영상 시청, 온라인 강의에는 충분한 경우가 많지만, 최신 게임·3D 작업·무거운 영상 편집은 제한될 수 있습니다.` };
      }

      if (/apple\s*m[1-4]|m[1-4]\s*(pro|max|ultra)?\s*gpu/i.test(text)) {
        return { label: 'Apple 통합 GPU', score: /max|ultra/i.test(text) ? 2.25 : /pro/i.test(text) ? 1.85 : 1.25, text: `${original}는 Apple Silicon 통합 GPU 계열로 보입니다. 영상 편집과 디자인 앱에서 전력 효율이 좋은 편이며, Pro·Max·Ultra 여부와 통합 메모리 용량에 따라 전문 작업 체감이 크게 달라집니다.` };
      }

      return { label: 'GPU 세부 확인 필요', score: 0.4, text: `${original}는 자동 규칙으로 그래픽 등급을 확정하기 어렵습니다. 제조사 사양표에서 정확한 GPU 모델명과 VRAM, 노트북이면 TGP를 함께 확인하는 것이 좋습니다.` };
    };

    const summarizeAutoGrade = (specs, manualGpu) => {
      const gpuText = manualGpu || specs.gpu.raw || '';
      const gpuGrade = classifyGpuText(gpuText);
      let score = 0;
      if (specs.cores >= 20) score += 3.4;
      else if (specs.cores >= 16) score += 3;
      else if (specs.cores >= 12) score += 2.5;
      else if (specs.cores >= 8) score += 2;
      else if (specs.cores >= 4) score += 1;
      if (specs.memory >= 64) score += 2.4;
      else if (specs.memory >= 32) score += 2;
      else if (specs.memory >= 16) score += 1.6;
      else if (specs.memory >= 8) score += 1;
      else if (specs.memory) score += 0.4;
      score += gpuGrade.score;

      if (score >= 7.3) return { label: '고성능 작업용·게이밍 PC급으로 볼 수 있는 구성', detail: '멀티태스킹, 개발, FHD~QHD 게임, 영상 편집 보조까지 여유가 있는 쪽입니다.', gpuGrade };
      if (score >= 5.8) return { label: '중상급 생산성·FHD 게임 가능급으로 볼 수 있는 구성', detail: '문서·웹·개발·가벼운 편집에는 여유가 있고, GPU 모델에 따라 게임 체감도 기대할 수 있습니다.', gpuGrade };
      if (score >= 3.8) return { label: '일반 업무·학습용 이상으로 볼 수 있는 구성', detail: '웹서핑, 문서 작업, 온라인 강의, 여러 탭 사용은 대체로 무난하며 무거운 게임·편집은 추가 확인이 필요합니다.', gpuGrade };
      if (score >= 1.8) return { label: '기본 업무·웹 사용 중심 구성으로 볼 수 있습니다', detail: '가벼운 작업에는 사용할 수 있지만, 멀티태스킹이나 무거운 프로그램은 체감이 제한될 수 있습니다.', gpuGrade };
      return { label: '자동 확인값만으로는 등급 판단이 제한됩니다', detail: 'CPU 모델명, RAM, GPU, 저장장치를 직접 입력하면 더 정확하게 해석할 수 있습니다.', gpuGrade };
    };

    const buildAutoInterpretationRows = (specs, manualGpu) => {
      const rows = [];
      const grade = summarizeAutoGrade(specs, manualGpu);
      const memoryText = specs.memory ? `메모리 추정 ${specs.memory}GB` : '메모리 자동 확인 제한';
      const coreText = specs.cores ? `CPU 논리 코어 ${specs.cores}개` : 'CPU 논리 코어 자동 확인 제한';
      const gpuText = manualGpu ? `직접 입력 GPU ${manualGpu}` : grade.gpuGrade.label;
      rows.push({ label: '종합 추정', text: `${coreText}, ${memoryText}, ${gpuText} 기준으로 ${grade.label}입니다. ${grade.detail}` });
      rows.push({ label: '운영체제', text: `${specs.os}로 추정됩니다. 웹페이지는 보안 정책상 Windows 세부 버전, 설치된 프로그램, 장치 드라이버 상태까지 직접 확인하지는 않습니다.` });
      if (specs.cores) {
        rows.push({ label: 'CPU 논리 코어', text: specs.cores >= 20 ? `${specs.cores}개로 표시됩니다. 고성능 데스크톱이나 상급 노트북에서 자주 보이는 범위라 개발·편집·동시 작업에 유리한 편입니다. 정확한 CPU 모델명은 직접 입력해야 합니다.` : specs.cores >= 16 ? `${specs.cores}개로 표시됩니다. 고성능 노트북 H급 CPU나 데스크톱 중급 이상 CPU에서 자주 보이는 범위라 멀티태스킹, 개발 도구, 가벼운 영상 편집에 유리한 편입니다.` : specs.cores >= 12 ? `${specs.cores}개로 표시됩니다. 일반 노트북보다 작업 여유가 있는 편이며, 여러 프로그램을 동시에 쓰는 환경에 비교적 적합합니다.` : specs.cores >= 8 ? `${specs.cores}개로 표시됩니다. 문서·웹·온라인 강의와 일반 멀티태스킹에는 무난한 편입니다.` : specs.cores >= 4 ? `${specs.cores}개로 표시됩니다. 기본 작업은 가능하지만 개발·편집·게임은 CPU 모델 확인이 필요합니다.` : `${specs.cores}개로 표시됩니다. 동시 작업이 많으면 체감이 제한될 수 있습니다.` });
      } else {
        rows.push({ label: 'CPU 논리 코어', text: '자동 확인이 제한되었습니다. CPU 모델명을 직접 입력하면 용도별 판단이 더 정확해집니다.' });
      }
      if (specs.memory) {
        rows.push({ label: '메모리 추정', text: specs.memory >= 64 ? `약 ${specs.memory}GB로 표시됩니다. 대형 영상 편집, 개발 서버, 가상머신, 대형 파일 작업까지 여유가 큰 범위입니다.` : specs.memory >= 32 ? `약 ${specs.memory}GB로 표시됩니다. 개발, 영상 편집, 여러 프로그램 동시 실행에 안정적인 편입니다.` : specs.memory >= 16 ? `약 ${specs.memory}GB로 표시됩니다. 현재 일반 노트북·PC 기준으로 표준 이상에 가까운 용량이며, 문서·웹·개발·FHD 게임에는 대체로 무난합니다. 영상 편집이나 가상머신은 32GB가 더 안정적입니다.` : specs.memory >= 8 ? `약 ${specs.memory}GB로 표시됩니다. 기본 작업은 가능하지만 여러 프로그램을 동시에 쓰거나 게임·편집을 하면 부족할 수 있습니다.` : `약 ${specs.memory}GB로 표시됩니다. 여러 프로그램을 동시에 쓰기에는 부족할 수 있습니다.` });
      } else {
        rows.push({ label: '메모리 추정', text: '브라우저가 RAM 추정값을 제공하지 않았습니다. 실제 용량을 직접 입력하는 것이 좋습니다.' });
      }
      rows.push({ label: manualGpu ? `GPU (${manualGpu})` : 'GPU', text: manualGpu ? `${grade.gpuGrade.text} 자동 WebGL 렌더러보다 직접 입력한 모델명을 기준으로 해석하는 것이 더 정확합니다.` : `${grade.gpuGrade.label}: 자동 WebGL 값은 참고용입니다. 실제 그래픽카드 모델명을 입력하면 게임·그래픽 작업 판단이 더 좋아집니다.` });
      rows.push({ label: '화면 해상도', text: `${specs.screen}입니다. FHD급 화면이면 문서·웹·영상 시청에 무난하고, QHD·4K 작업은 화면 공간이 넓지만 GPU 부담도 커질 수 있습니다.` });
      return { grade, rows };
    };

    const interpretAutoSpecs = () => {
      const specs = lastAutoSpecs || collectAutoSpecs();
      const manualGpu = autoGpuInput?.value.trim() || '';
      const { grade, rows } = buildAutoInterpretationRows(specs, manualGpu);
      const body = `
        <div class="pc-result-summary">
          <div class="summary-callout"><strong>${escape(grade.label)}</strong><br>${escape(grade.detail)} 자동 확인값은 브라우저가 제공하는 범위 안에서만 표시되므로, 정확한 CPU·GPU·저장장치 모델명은 직접 입력 결과와 함께 보는 것이 좋습니다.</div>
          <div class="result-list">
            ${rows.map((row) => `<div class="result-row"><span>${escape(row.label)}</span><strong>${escape(row.text)}</strong></div>`).join('')}
          </div>
          <p class="legal-note pc-note"><strong>안내:</strong> 이 해석은 자동 확인값과 직접 입력한 GPU명을 바탕으로 한 참고 설명입니다. 실제 성능은 정확한 모델명, 전력 제한, 발열, 드라이버, 작업 종류에 따라 달라집니다.</p>
        </div>`;
      showModal({ eyebrow: '자동 사양 해석', title: '자동 확인 사양 결과', body, wide: true });
    };

    const classifyCpuScore = (score) => {
      if (score >= 135000000) return { label: '매우 높음', tone: 'success', width: '98%', range: '고성능 데스크톱 i7/Ryzen 7급 이상 가능 범위', text: '짧은 반복 연산 기준으로 매우 높은 처리량입니다. 단, 브라우저 테스트라 실제 CPU 순위와 일치하지 않을 수 있습니다.' };
      if (score >= 90000000) return { label: '높음', tone: 'success', width: '86%', range: '고성능 노트북 i5·i7 H급 또는 데스크톱 i5급 사이로 볼 수 있는 범위', text: '일반 작업, 개발, 가벼운 편집, 멀티태스킹에 비교적 유리한 처리량입니다.' };
      if (score >= 55000000) return { label: '보통 이상', tone: 'neutral', width: '66%', range: '일반 노트북 i5/Ryzen 5 U급과 일부 데스크톱 보급형 CPU 사이로 볼 수 있는 범위', text: '문서 작업, 웹 사용, 온라인 강의, 가벼운 작업에는 무난한 참고 처리량입니다.' };
      if (score >= 25000000) return { label: '보통', tone: 'neutral', width: '46%', range: '보급형 노트북 i3·Ryzen 3급 또는 구형 i5급 사이로 볼 수 있는 범위', text: '일반 작업은 가능하지만 여러 프로그램을 동시에 쓰거나 무거운 작업에서는 체감 차이가 날 수 있습니다.' };
      return { label: '낮음', tone: 'warning', width: '28%', range: '저전력·입문형 CPU, Intel N100 또는 구형 모바일 CPU에 가까운 범위', text: '현재 환경에서는 처리량이 낮게 측정되었습니다. 절전 모드, 발열, 백그라운드 작업을 확인해 보세요.' };
    };

    const openCpuResultModal = (score, elapsed, grade) => {
      const body = `
        <div class="pc-result-summary">
          <div class="summary-callout">참고 점수는 <strong>${escape(score.toLocaleString('ko-KR'))} ops/sec</strong>입니다. 현재 측정값은 <strong>${escape(grade.range)}</strong>로 이해하면 됩니다.</div>
          <div class="modal-benchmark-meter" aria-label="CPU 간단 테스트 상대 위치"><span style="width: ${escape(grade.width)}"></span></div>
          <div class="cpu-compare-card">
            <strong>${escape(grade.label)} · ${escape(grade.range)}</strong>
            <p>${escape(grade.text)}</p>
          </div>
          <div class="result-list">
            <div class="result-row"><span>참고 점수</span><strong>${escape(score.toLocaleString('ko-KR'))} ops/sec</strong></div>
            <div class="result-row"><span>측정 시간</span><strong>약 ${escape(Math.round(elapsed))}ms</strong></div>
            <div class="result-row"><span>주의할 점</span><strong>브라우저, 전원 모드, 발열, 백그라운드 작업에 따라 점수가 달라질 수 있습니다.</strong></div>
          </div>
          <p class="legal-note pc-note"><strong>안내:</strong> 이 비교군은 체감 이해를 돕기 위한 참고 설명입니다. 실제 CPU 벤치마크 순위나 제품 성능을 보장하지 않습니다.</p>
        </div>`;
      showModal({ eyebrow: 'CPU 간단 테스트', title: 'CPU 간단 테스트 결과', body, wide: true });
    };

    const runCpuTest = () => {
      cpuTestButton.disabled = true;
      cpuTestButton.textContent = 'CPU 테스트 중...';
      showModal({ eyebrow: 'CPU 간단 테스트', title: 'CPU 테스트 중입니다', body: '<p>브라우저 안에서 약 1초 동안 짧은 반복 연산을 실행하고 있습니다. 잠시만 기다려 주세요.</p>' });

      const workerCode = `
        self.onmessage = () => {
          const start = performance.now();
          let count = 0;
          let checksum = 0;
          while (performance.now() - start < 900) {
            for (let i = 0; i < 10000; i += 1) {
              checksum = (checksum + Math.sqrt((i + count) % 9973)) % 1000000;
            }
            count += 10000;
          }
          const elapsed = performance.now() - start;
          self.postMessage({ count, elapsed, checksum });
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (event) => {
        const { count, elapsed } = event.data || {};
        const score = Math.round((count / elapsed) * 1000);
        const grade = classifyCpuScore(score);
        cpuTestButton.disabled = false;
        cpuTestButton.textContent = 'CPU 간단 테스트 다시 시작';
        openCpuResultModal(score, elapsed, grade);
        worker.terminate();
      };
      worker.onerror = () => {
        cpuTestButton.disabled = false;
        cpuTestButton.textContent = 'CPU 간단 테스트 시작';
        showModal({ eyebrow: 'CPU 간단 테스트', title: 'CPU 테스트 실행 오류', body: '<p>현재 브라우저 환경에서 CPU 간단 테스트를 실행할 수 없습니다. 새로고침 후 다시 시도해 주세요.</p>' });
        worker.terminate();
      };
      worker.postMessage({});
    };

    const analyzeCpuModel = (cpu) => {
      const value = String(cpu || '').trim();
      const text = value.toLowerCase();
      if (!value) return { score: 0, tier: 'CPU 미입력', text: 'CPU 모델명을 입력하면 작업 성격에 맞는 해석이 더 구체적입니다.' };

      const ultra = text.match(/core\s*ultra\s*([579])\s*([0-9]{3}[a-z]*)?/i);
      if (ultra) {
        const grade = Number(ultra[1]);
        const model = ultra[2] || '';
        const score = grade >= 9 ? 3.5 : grade >= 7 ? 3.05 : 2.45;
        const tier = `Intel Core Ultra ${grade}${model ? ` ${model}` : ''} 계열`;
        const textOut = `${value}는 Intel Core Ultra ${grade} 계열로 보입니다. Core Ultra는 AI/NPU와 전력 효율을 강조한 비교적 최신 모바일 CPU 라인입니다. 숫자 5·7·9는 대략적인 제품 등급을 뜻하며, 9가 가장 상위에 가깝습니다. 문서·개발·멀티태스킹에는 유리하고, 게임·영상 편집은 GPU와 전력 설정도 함께 봐야 합니다.`;
        return { score, tier, text: textOut };
      }

      const intel = text.match(/(?:intel\s*)?(?:core\s*)?i([3579])[-\s]?(\d{3,5})?\s*([a-z]{0,3})/i);
      const ryzenAi = text.match(/ryzen\s*ai\s*(?:([3579])\s*)?(?:hx\s*)?(\d{3})?/i);
      const ryzen = text.match(/ryzen\s*([3579])\s*(\d{4,5})?\s*([a-z]{0,3})/i);
      const apple = text.match(/(?:apple\s*)?m([1-4])\s*(pro|max|ultra)?/i);

      if (intel) {
        const grade = Number(intel[1]);
        const num = intel[2] || '';
        const suffix = (intel[3] || '').toUpperCase();
        const generation = num.length >= 5 ? Number(num.slice(0, 2)) : num.length >= 4 ? Number(num.slice(0, 1)) : null;
        const className = grade >= 9 ? '최상급' : grade >= 7 ? '상급' : grade >= 5 ? '중급' : '보급형';
        const suffixDesc = /HX/.test(suffix) ? 'HX는 고성능 노트북용 최상위 전력대에 가까운 표기입니다.' : /H|HK/.test(suffix) ? 'H는 고성능 노트북용 CPU에서 자주 쓰이는 표기입니다.' : /P/.test(suffix) ? 'P는 휴대성과 성능 사이의 모바일 라인에서 자주 보입니다.' : /U|Y/.test(suffix) ? 'U·Y는 저전력 노트북용 표기로 배터리 효율을 중시하는 경우가 많습니다.' : /K/.test(suffix) ? 'K는 데스크톱에서 오버클럭 가능 계열에 붙는 표기입니다.' : /F/.test(suffix) ? 'F는 보통 내장 그래픽이 빠진 데스크톱 CPU 표기입니다.' : '접미사가 없거나 명확하지 않으면 데스크톱/노트북 여부를 사양표에서 함께 보는 것이 좋습니다.';
        const genDesc = generation ? `${num}에서 앞의 ${generation}은 세대를 보는 핵심 숫자입니다. 같은 i5·i7이라도 세대가 높을수록 효율과 기능이 좋아지는 경향이 있습니다.` : '세대 숫자를 확인하면 오래된 CPU인지 최근 CPU인지 판단하기 쉬워집니다.';
        let score = grade >= 9 ? 3.75 : grade >= 7 ? 3.05 : grade >= 5 ? 2.35 : 1.25;
        if (/HX|H|HK/.test(suffix)) score += 0.35;
        if (/U|Y/.test(suffix)) score -= 0.25;
        const tier = `Intel Core i${grade}${generation ? ` ${generation}세대` : ''} ${className} CPU`;
        const use = grade >= 7 ? '게임, 개발 도구, 멀티태스킹, FHD 영상 편집에 비교적 유리합니다' : grade === 5 ? '문서·웹·개발 입문·FHD 게임 보조에 무난한 중간급으로 볼 수 있습니다' : '문서·웹·온라인 강의 중심의 기본 작업에 맞는 쪽으로 보는 것이 안전합니다';
        return { score, tier, text: `${value}는 ${tier}로 보입니다. i3·i5·i7·i9에서 숫자는 제품 등급을 뜻하며, i3는 보급형, i5는 중급, i7은 상급, i9는 최상급에 가깝습니다. ${genDesc} ${suffixDesc} 이 CPU는 ${use}.` };
      }

      if (ryzenAi) {
        const grade = Number(ryzenAi[1] || 9);
        const model = ryzenAi[2] || '';
        const score = grade >= 9 ? 3.55 : grade >= 7 ? 3.05 : 2.45;
        return { score, tier: `Ryzen AI ${grade}${model ? ` ${model}` : ''} 계열`, text: `${value}는 Ryzen AI 계열로 보입니다. AI/NPU와 전력 효율을 강조한 최신 모바일 CPU 라인에 가깝고, 문서·개발·멀티태스킹·콘텐츠 작업에 유리한 편입니다. 게임과 그래픽 작업은 내장 GPU인지 외장 GPU인지에 따라 체감 차이가 큽니다.` };
      }

      if (ryzen) {
        const grade = Number(ryzen[1]);
        const num = ryzen[2] || '';
        const suffix = (ryzen[3] || '').toUpperCase();
        const series = num ? Number(num[0]) : null;
        const className = grade >= 9 ? '최상급' : grade >= 7 ? '상급' : grade >= 5 ? '중급' : '보급형';
        const suffixDesc = /HX/.test(suffix) ? 'HX는 고성능 노트북용 상위 전력대 표기입니다.' : /HS/.test(suffix) ? 'HS는 고성능과 휴대성 균형을 노린 노트북용 표기입니다.' : /H/.test(suffix) ? 'H는 고성능 노트북용 CPU에서 자주 쓰입니다.' : /U/.test(suffix) ? 'U는 저전력 노트북용 표기로 배터리 효율을 중시하는 경우가 많습니다.' : /X/.test(suffix) ? 'X는 데스크톱 고성능 계열에서 자주 보이는 표기입니다.' : '접미사는 데스크톱/노트북 라인과 전력 특성을 볼 때 참고합니다.';
        let score = grade >= 9 ? 3.6 : grade >= 7 ? 3.1 : grade >= 5 ? 2.35 : 1.25;
        if (/HX|HS|H|X/.test(suffix)) score += 0.25;
        if (/U/.test(suffix)) score -= 0.2;
        return { score, tier: `Ryzen ${grade}${series ? ` ${series}000번대` : ''} ${className} CPU`, text: `${value}는 Ryzen ${grade} 계열로 보입니다. Ryzen 3·5·7·9의 숫자는 제품 등급을 뜻하며, 5는 중급, 7은 상급, 9는 최상급에 가깝습니다. ${num ? `${num}의 첫 숫자 ${num[0]}은 제품 세대를 보는 데 도움이 됩니다.` : '모델 숫자를 알면 세대와 등급을 더 구체적으로 볼 수 있습니다.'} ${suffixDesc} 멀티태스킹과 개발·편집 작업은 RAM 용량과 저장장치 속도도 함께 봐야 합니다.` };
      }

      if (apple) {
        const gen = Number(apple[1]);
        const suffix = apple[2] ? apple[2].toUpperCase() : '';
        const score = suffix === 'ULTRA' ? 3.8 : suffix === 'MAX' ? 3.55 : suffix === 'PRO' ? 3.15 : 2.35 + gen * 0.08;
        const tier = `Apple M${gen}${suffix ? ` ${suffix}` : ''} 계열`;
        const desc = suffix ? `${suffix}는 기본 M칩보다 GPU와 메모리 대역폭, 전문 작업 여유가 큰 상위 라인입니다.` : '기본 M칩은 전력 효율과 일상·개발·콘텐츠 작업 균형이 좋은 편입니다.';
        return { score, tier, text: `${value}는 ${tier}로 보입니다. Apple M 시리즈는 CPU와 GPU, 메모리를 통합한 구조라 전력 효율이 좋습니다. ${desc} 영상 편집과 디자인 작업은 메모리 용량과 Pro/Max/Ultra 여부를 함께 확인해야 합니다.` };
      }

      if (/n100|n200|celeron|pentium|athlon/i.test(text)) return { score: 0.9, tier: '입문형·저전력 CPU', text: `${value}는 입문형 또는 저전력 CPU 계열로 보입니다. 웹서핑, 문서, 영상 시청 중심으로 보는 것이 좋고, 개발·게임·편집 같은 무거운 작업에는 제한이 큽니다.` };
      return { score: 1.8, tier: '세부 확인 필요 CPU', text: `${value}는 자동 규칙으로 세대와 등급을 확정하기 어렵습니다. 제조사 사양표에서 정확한 CPU 라인, 세대, 접미사, 코어 수를 함께 확인하는 것이 좋습니다.` };
    };

    const analyzeRamValue = (ram) => {
      const gb = parseMemory(ram);
      if (!gb) return { score: 0, tier: 'RAM 미입력', text: 'RAM 용량을 입력하면 멀티태스킹과 작업 여유를 더 잘 판단할 수 있습니다.' };
      if (gb >= 64) return { score: 2.5, tier: `${gb}GB 대용량 RAM`, text: `${gb}GB는 대형 영상 편집, 개발 서버, 가상머신, 대형 파일 작업까지 여유가 큰 용량입니다.` };
      if (gb >= 32) return { score: 2.2, tier: `${gb}GB 고용량 RAM`, text: `${gb}GB는 개발, 영상 편집, 여러 프로그램 동시 실행에 안정적인 편입니다.` };
      if (gb >= 16) return { score: 1.6, tier: `${gb}GB 표준 이상 RAM`, text: `${gb}GB는 현재 일반 노트북·PC 기준으로 표준 이상에 가까운 용량입니다. 문서·웹·개발·FHD 게임에는 무난하지만, 영상 편집·가상머신·최신 게임을 오래 쓰면 32GB가 더 안정적입니다.` };
      if (gb >= 8) return { score: 0.9, tier: `${gb}GB 기본 RAM`, text: `${gb}GB는 기본 작업에는 가능하지만 브라우저 탭이 많거나 게임·편집을 하면 부족할 수 있습니다.` };
      return { score: 0.3, tier: `${gb}GB 저용량 RAM`, text: `${gb}GB는 현대 웹 사용과 멀티태스킹에서 답답할 가능성이 큽니다.` };
    };

    const analyzeGpuModel = (gpu) => {
      const value = String(gpu || '').trim();
      if (!value) return { score: 0, tier: 'GPU 미입력', text: 'GPU 모델명을 입력하면 게임, 그래픽 작업, 영상 편집 보조 성능을 더 잘 판단할 수 있습니다.' };
      const grade = classifyGpuText(value);
      return { score: grade.score, tier: `${value} · ${grade.label}`, text: grade.text };
    };

    const analyzeStorageValue = (storage) => {
      const value = String(storage || '').trim();
      const text = value.toLowerCase();
      if (!value) return { score: 0, tier: '저장장치 미입력', text: '저장장치 종류와 용량을 입력하면 체감 속도와 저장 여유를 판단하기 쉽습니다.' };
      const capacity = value.match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i);
      const capText = capacity ? `${capacity[1]}${capacity[2].toUpperCase()}` : '용량 미표시';
      if (/gen\s*5|pcie\s*5/i.test(text)) return { score: 2.05, tier: `PCIe 5.0 NVMe SSD · ${capText}`, text: `${value}는 PCIe 5.0 NVMe SSD 계열로 보입니다. 대용량 파일 이동과 전문 작업에서 빠른 편이지만, 일반 사용 체감은 발열·컨트롤러·용량에 따라 달라집니다.` };
      if (/gen\s*4|pcie\s*4|sn850|990\s*pro|980\s*pro|p41|sn770|sn740/i.test(text)) return { score: 1.9, tier: `PCIe 4.0 NVMe SSD · ${capText}`, text: `${value}는 PCIe 4.0급 NVMe SSD 계열로 보입니다. 부팅, 프로그램 실행, 게임 로딩, 대용량 파일 작업 체감에 유리합니다. 입력값에 용량이 없다면 실제 저장 공간은 따로 확인하세요.` };
      if (/wd\s*pc\s*sn740|sn740/i.test(text)) return { score: 1.8, tier: `NVMe SSD · WD PC SN740 계열 · ${capText}`, text: `${value}는 WD PC SN740 계열의 NVMe SSD로 보입니다. 부팅, 프로그램 실행, 게임 로딩 체감에 유리한 저장장치입니다. 다만 입력값에 용량이 보이지 않으므로 실제 저장 공간은 별도로 확인하는 것이 좋습니다.` };
      if (/nvme|pcie/i.test(text)) return { score: 1.7, tier: `NVMe SSD · ${capText}`, text: `${value}는 NVMe SSD 계열로 보입니다. 일반 SATA SSD보다 빠른 편이라 부팅, 프로그램 실행, 대용량 파일 작업 체감에 유리합니다.` };
      if (/sata.*ssd|ssd/i.test(text)) return { score: 1.35, tier: `SATA/일반 SSD · ${capText}`, text: `${value}는 SSD 계열로 보입니다. HDD보다 부팅과 프로그램 실행 체감이 확실히 좋지만, NVMe SSD보다 대용량 전송 속도는 낮을 수 있습니다.` };
      if (/hdd/i.test(text)) return { score: 0.6, tier: `HDD · ${capText}`, text: `${value}는 HDD 계열로 보입니다. 대용량 보관에는 유리하지만 운영체제와 프로그램 실행 체감은 SSD보다 느릴 수 있습니다.` };
      if (/emmc/i.test(text)) return { score: 0.35, tier: `eMMC 저장장치 · ${capText}`, text: `${value}는 eMMC 계열로 보입니다. 저가형 노트북·태블릿에서 자주 보이며, 일반 SSD보다 체감 속도가 낮을 수 있습니다.` };
      return { score: 0.8, tier: `저장장치 세부 확인 필요 · ${capText}`, text: `${value}는 저장장치 종류를 확정하기 어렵습니다. SSD/NVMe/HDD 여부와 용량을 함께 확인하는 것이 좋습니다.` };
    };

    const purposeLabel = (purpose) => ({
      office: '문서·웹·온라인 강의',
      design: '이미지 편집·디자인',
      video: '영상 편집',
      game: '게임',
      coding: '코딩·개발 작업'
    }[purpose] || '선택하지 않음');

    const buildPurposeComment = ({ purpose, cpuInfo, ramInfo, gpuInfo, storageInfo }) => {
      if (purpose === 'game') {
        return `게임 기준으로는 GPU 비중이 큽니다. ${gpuInfo.tier}이면 그래픽 옵션과 해상도에 따라 체감이 달라지고, ${cpuInfo.tier}와 ${ramInfo.tier} 조합은 프레임 유지와 백그라운드 프로그램 실행에 영향을 줍니다. QHD 이상 해상도나 최신 AAA 게임은 GPU 등급, VRAM, 노트북 TGP를 함께 확인해야 합니다.`;
      }
      if (purpose === 'video') return `영상 편집은 CPU, RAM, 저장장치, GPU가 모두 영향을 줍니다. ${cpuInfo.tier}, ${ramInfo.tier}, ${storageInfo.tier} 기준으로 FHD 편집은 가능성이 있지만, 4K·고비트레이트·효과가 많은 프로젝트는 32GB 이상 RAM과 더 높은 GPU 여유가 체감됩니다.`;
      if (purpose === 'coding') return `개발 작업은 CPU 코어, RAM, SSD 체감이 중요합니다. ${cpuInfo.tier}, ${ramInfo.tier}, ${storageInfo.tier} 조합이면 일반 개발과 멀티태스킹은 비교적 무난하며, Docker·가상머신·로컬 서버를 많이 쓰면 RAM과 SSD 여유를 더 보는 것이 좋습니다.`;
      if (purpose === 'design') return `이미지 편집·디자인은 RAM과 저장장치 체감이 큽니다. ${ramInfo.tier}, ${storageInfo.tier} 조합이면 일반 편집은 무난한 편이며, 대용량 파일과 GPU 가속 기능은 ${gpuInfo.tier}에 따라 달라집니다.`;
      if (purpose === 'office') return `문서·웹·온라인 강의 기준으로는 CPU보다 RAM과 저장장치 체감도 중요합니다. ${ramInfo.tier}, ${storageInfo.tier}라면 일반적인 사용에는 무난하며, 화상회의와 브라우저 탭을 많이 열면 RAM 여유가 중요합니다.`;
      return '사용 목적을 선택하면 이 사양이 어떤 작업에 더 적합한지 더 구체적으로 해석할 수 있습니다.';
    };

    const interpretManual = (data) => {
      const cpu = data.get('cpu')?.trim() || '';
      const ram = data.get('ram')?.trim() || '';
      const gpu = data.get('gpu')?.trim() || '';
      const storage = data.get('storage')?.trim() || '';
      const purpose = data.get('purpose') || '';
      const cpuInfo = analyzeCpuModel(cpu);
      const ramInfo = analyzeRamValue(ram);
      const gpuInfo = analyzeGpuModel(gpu);
      const storageInfo = analyzeStorageValue(storage);
      const score = cpuInfo.score + ramInfo.score + gpuInfo.score + storageInfo.score;
      const profile = score >= 9 ? '고성능 게이밍·작업용 PC급으로 볼 수 있는 구성' : score >= 7.2 ? '중상급 노트북·FHD/QHD 게임·개발 작업에 적합한 구성' : score >= 5.2 ? '일반 업무와 학습, 개발 입문, 가벼운 편집에 무난한 구성' : score >= 3 ? '기본 작업 중심 구성' : '입력 정보가 부족하거나 보급형 중심 구성';
      const summary = `${[cpuInfo.tier, ramInfo.tier, gpuInfo.tier, storageInfo.tier].filter(Boolean).join(' / ')} 기준으로 ${profile}입니다.`;
      return {
        profile,
        summary,
        rows: [
          { label: '종합', text: summary },
          { label: cpu ? `CPU (${cpu})` : 'CPU', text: cpuInfo.text },
          { label: ram ? `RAM (${ram})` : 'RAM', text: ramInfo.text },
          { label: gpu ? `GPU (${gpu})` : 'GPU', text: gpuInfo.text },
          { label: storage ? `저장장치 (${storage})` : '저장장치', text: storageInfo.text },
          { label: `사용 목적 (${purposeLabel(purpose)})`, text: buildPurposeComment({ purpose, cpuInfo, ramInfo, gpuInfo, storageInfo }) }
        ]
      };
    };

    const showManualResult = (result) => {
      const body = `
        <div class="pc-result-summary">
          <div class="summary-callout"><strong>${escape(result.profile)}</strong><br>${escape(result.summary)}</div>
          <div class="result-list">
            ${result.rows.map((row) => `<div class="result-row"><span>${escape(row.label)}</span><strong>${escape(row.text)}</strong></div>`).join('')}
          </div>
          <p class="legal-note pc-note"><strong>안내:</strong> 이 해석은 입력한 모델명과 일반적인 사양 기준을 바탕으로 한 참고 설명입니다. 같은 CPU·GPU라도 노트북 전력 제한, 발열, 드라이버, 게임별 최적화, 작업 종류에 따라 체감 성능이 달라집니다.</p>
        </div>`;
      showModal({ eyebrow: '직접 입력 사양', title: '직접 입력 사양 해석', body, wide: true });
    };

    const normalizeOcrText = (text) => String(text || '').replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim();

    const extractSpecsFromText = (text) => {
      const raw = normalizeOcrText(text);
      const lower = raw.toLowerCase();
      const lineText = String(text || '').split(/\n|\r/).map((line) => line.trim()).filter(Boolean);
      const findLine = (keywords) => lineText.find((line) => keywords.some((word) => line.toLowerCase().includes(word)));
      const cpuPattern = /(intel\s*)?(core\s*)?i[3579][-\s]?\d{3,5}[a-z]{0,3}|ryzen\s*[3579]\s*\d{3,5}[a-z]{0,3}|apple\s*m[1-4](\s*(pro|max|ultra))?|m[1-4](\s*(pro|max|ultra))?/i;
      const gpuPattern = /rtx\s*\d{3,4}\s*(ti|super|laptop)?|gtx\s*\d{3,4}\s*(ti)?|radeon\s*(rx)?\s*\d{3,4}\s*[a-z]{0,3}|intel\s*(iris\s*xe|uhd\s*graphics|arc\s*[a-z0-9]+)|apple\s*m[1-4]\s*(gpu)?/i;
      const ramPattern = /(\d{1,3})\s*(gb|기가)\s*(ram|memory|메모리)?/i;
      const storagePattern = /((nvme\s*)?(ssd|hdd)\s*[a-z0-9\-\s]*\d+(?:\.\d+)?\s*(tb|gb)|\d+(?:\.\d+)?\s*(tb|gb)\s*(nvme\s*)?(ssd|hdd))/i;

      let cpu = raw.match(cpuPattern)?.[0] || '';
      const cpuLine = findLine(['cpu', 'processor', '프로세서', '칩']);
      if (cpuLine && !cpu) cpu = cpuLine.replace(/^(cpu|processor|프로세서|칩)\s*[:：-]?\s*/i, '').slice(0, 80);

      let ram = raw.match(ramPattern)?.[0] || '';
      const ramLine = findLine(['ram', 'memory', '메모리']);
      if (ramLine && !ram) ram = ramLine.match(/\d{1,3}\s*(gb|기가)/i)?.[0] || '';

      let gpu = raw.match(gpuPattern)?.[0] || '';
      const gpuLine = findLine(['gpu', 'graphics', '그래픽', 'vga']);
      if (gpuLine && !gpu) gpu = gpuLine.replace(/^(gpu|graphics|그래픽|vga)\s*[:：-]?\s*/i, '').slice(0, 90);

      let storage = raw.match(storagePattern)?.[0] || '';
      const storageLine = findLine(['ssd', 'hdd', 'storage', '저장장치', '스토리지']);
      if (storageLine && !storage) storage = storageLine.replace(/^(storage|저장장치|스토리지)\s*[:：-]?\s*/i, '').slice(0, 100);

      return { cpu, ram, gpu, storage, raw, lower };
    };

    const fillIfFound = (selector, value) => {
      const input = document.querySelector(selector);
      if (input && value) input.value = value.trim();
    };

    const fieldTargets = {
      cpu: { selector: '#manual-cpu', label: 'CPU', key: 'cpu' },
      ram: { selector: '#manual-ram', label: 'RAM', key: 'ram' },
      gpu: { selector: '#manual-gpu', label: 'GPU', key: 'gpu' },
      storage: { selector: '#manual-storage', label: '저장장치', key: 'storage' },
      autoGpu: { selector: '#auto-gpu-manual', label: 'GPU', key: 'gpu' }
    };

    const extractTargetValue = (text, targetKey) => {
      const target = fieldTargets[targetKey];
      if (!target) return '';
      const specs = extractSpecsFromText(text);
      return specs[target.key] || normalizeOcrText(text).slice(0, 100);
    };

    const fillTargetValue = (targetKey, value) => {
      const target = fieldTargets[targetKey];
      if (!target || !value) return false;
      const input = document.querySelector(target.selector);
      if (!input) return false;
      input.value = String(value).trim();
      return true;
    };

    const recognizeImageText = async (file, statusElement = ocrStatus) => {
      if (!window.Tesseract?.recognize) throw new Error('OCR 모듈을 불러오지 못했습니다.');
      const result = await window.Tesseract.recognize(file, 'kor+eng', {
        logger: (message) => {
          if (!statusElement || message.status !== 'recognizing text') return;
          const pct = Math.round((message.progress || 0) * 100);
          statusElement.textContent = `텍스트 인식 중... ${pct}%`;
        }
      });
      return result?.data?.text || '';
    };

    const readPdfText = async (file) => {
      if (!window.pdfjsLib?.getDocument) throw new Error('PDF 분석 모듈을 불러오지 못했습니다.');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const data = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data }).promise;
      const pageCount = Math.min(pdf.numPages, 3);
      const parts = [];
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const textContent = await page.getTextContent();
        parts.push(textContent.items.map((item) => item.str || '').join(' '));
      }
      const text = parts.join('\n').trim();
      if (text) return text;
      if (!window.Tesseract?.recognize) return '';
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? recognizeImageText(blob) : '';
    };

    const processSpecText = (text, sourceLabel = '사양표') => {
      const specs = extractSpecsFromText(text);
      fillIfFound('#manual-cpu', specs.cpu);
      fillIfFound('#manual-ram', specs.ram);
      fillIfFound('#manual-gpu', specs.gpu);
      fillIfFound('#manual-storage', specs.storage);
      const found = [specs.cpu && 'CPU', specs.ram && 'RAM', specs.gpu && 'GPU', specs.storage && '저장장치'].filter(Boolean);
      if (ocrStatus) ocrStatus.textContent = found.length ? `${found.join(', ')} 후보를 입력란에 채웠습니다. 정확한지 직접 확인해 주세요.` : '자동으로 찾은 사양 후보가 없습니다. 더 선명한 이미지·PDF를 사용하거나 직접 입력해 주세요.';
      showModal({
        eyebrow: '사양표 자동 인식',
        title: `${sourceLabel} 인식 결과`,
        wide: true,
        body: `
          <div class="pc-result-summary">
            <div class="summary-callout">인식한 텍스트에서 찾은 후보를 입력란에 채웠습니다. OCR과 PDF 추출은 오인식이 있을 수 있으므로 모델명과 용량을 반드시 확인해 주세요.</div>
            <div class="result-list">
              <div class="result-row"><span>CPU 후보</span><strong>${escape(specs.cpu || '찾지 못함')}</strong></div>
              <div class="result-row"><span>RAM 후보</span><strong>${escape(specs.ram || '찾지 못함')}</strong></div>
              <div class="result-row"><span>GPU 후보</span><strong>${escape(specs.gpu || '찾지 못함')}</strong></div>
              <div class="result-row"><span>저장장치 후보</span><strong>${escape(specs.storage || '찾지 못함')}</strong></div>
            </div>
            <p class="legal-note pc-note"><strong>안내:</strong> 이미지와 PDF는 브라우저에서 텍스트 인식·추출에만 사용하며, 한눈체크 서버 DB에 저장하지 않습니다.</p>
          </div>`
      });
    };

    const runSpecFileExtract = async (file) => {
      if (!file) return;
      if (ocrStatus) ocrStatus.textContent = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf') ? 'PDF에서 사양 텍스트를 추출하는 중입니다.' : '이미지에서 텍스트를 인식하는 중입니다. 잠시만 기다려 주세요.';
      try {
        const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
        const text = isPdf ? await readPdfText(file) : await recognizeImageText(file, ocrStatus);
        processSpecText(text, isPdf ? 'PDF 사양표' : '이미지 사양표');
      } catch (error) {
        if (ocrStatus) ocrStatus.textContent = '텍스트 인식에 실패했습니다. 직접 입력해 주세요.';
        showModal({ eyebrow: '사양표 자동 인식', title: '인식 실패', body: `<p>사양표 인식 중 오류가 발생했습니다. 직접 입력하거나 더 선명한 이미지·텍스트 포함 PDF로 다시 시도해 주세요.</p><p class="legal-note pc-note">${escape(error?.message || '')}</p>` });
      }
    };

    const readClipboardForTarget = async (targetKey) => {
      const target = fieldTargets[targetKey];
      if (!target) return;
      try {
        if (navigator.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const textType = item.types.find((type) => type === 'text/plain');
            if (textType) {
              const blob = await item.getType(textType);
              const text = await blob.text();
              const value = extractTargetValue(text, targetKey);
              if (fillTargetValue(targetKey, value)) {
                showModal({ eyebrow: '붙여넣기 인식', title: `${target.label} 값을 채웠습니다`, body: `<p>클립보드 텍스트에서 <strong>${escape(value)}</strong> 값을 추출했습니다. 정확한지 확인해 주세요.</p>` });
                return;
              }
            }
            const imageType = item.types.find((type) => type.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              const text = await recognizeImageText(blob);
              const value = extractTargetValue(text, targetKey);
              if (fillTargetValue(targetKey, value)) {
                showModal({ eyebrow: '붙여넣기 인식', title: `${target.label} 이미지 인식 결과`, body: `<p>클립보드 이미지에서 <strong>${escape(value)}</strong> 후보를 채웠습니다. OCR 결과는 반드시 확인해 주세요.</p>` });
                return;
              }
            }
          }
        }
        if (navigator.clipboard?.readText) {
          const text = await navigator.clipboard.readText();
          const value = extractTargetValue(text, targetKey);
          if (fillTargetValue(targetKey, value)) {
            showModal({ eyebrow: '붙여넣기 인식', title: `${target.label} 값을 채웠습니다`, body: `<p>클립보드 텍스트에서 <strong>${escape(value)}</strong> 값을 추출했습니다. 정확한지 확인해 주세요.</p>` });
            return;
          }
        }
        throw new Error('클립보드에서 인식할 수 있는 텍스트나 이미지를 찾지 못했습니다.');
      } catch (error) {
        showModal({ eyebrow: '붙여넣기 인식', title: '클립보드 인식이 제한되었습니다', body: `<p>브라우저 권한이나 보안 설정 때문에 클립보드 이미지를 직접 읽지 못했습니다. 해당 입력칸을 클릭한 뒤 Ctrl+V 또는 ⌘+V로 붙여넣어 보세요.</p><p class="legal-note pc-note">${escape(error?.message || '')}</p>` });
      }
    };

    manualForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = interpretManual(new FormData(manualForm));
      showManualResult(result);
    });

    imageInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      runSpecFileExtract(file);
    });

    Object.entries(fieldTargets).forEach(([targetKey, config]) => {
      const input = document.querySelector(config.selector);
      input?.addEventListener('paste', async (event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (!imageItem) return;
        event.preventDefault();
        try {
          const file = imageItem.getAsFile();
          const text = await recognizeImageText(file);
          const value = extractTargetValue(text, targetKey);
          if (fillTargetValue(targetKey, value)) {
            showModal({ eyebrow: '붙여넣기 인식', title: `${config.label} 이미지 인식 결과`, body: `<p>붙여넣은 이미지에서 <strong>${escape(value)}</strong> 후보를 채웠습니다. 정확한지 확인해 주세요.</p>` });
          }
        } catch (error) {
          showModal({ eyebrow: '붙여넣기 인식', title: '이미지 인식 실패', body: `<p>붙여넣은 이미지에서 텍스트를 인식하지 못했습니다. 더 선명한 캡처를 사용하거나 직접 입력해 주세요.</p><p class="legal-note pc-note">${escape(error?.message || '')}</p>` });
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const pasteButton = event.target.closest('[data-ocr-target]');
      if (pasteButton) {
        readClipboardForTarget(pasteButton.dataset.ocrTarget);
        return;
      }
      const helpButton = event.target.closest('[data-help-topic]');
      if (!helpButton) return;
      const topic = helpContents[helpButton.dataset.helpTopic];
      if (!topic) return;
      showModal({ eyebrow: '확인 위치', title: topic.title, body: topic.body });
    });

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });

    refreshButton?.addEventListener('click', renderAutoSpecs);
    autoSpecInterpretButton?.addEventListener('click', interpretAutoSpecs);
    cpuTestButton?.addEventListener('click', runCpuTest);
    renderAutoSpecs();
  }


  const form = document.querySelector('#business-check-form');
  if (!form) return;

  const submitButton = document.querySelector('#check-submit');
  const resultPanel = document.querySelector('#result-panel');
  const resultUpdated = document.querySelector('#result-updated');
  const resultMessage = document.querySelector('#result-message');
  const statusStack = document.querySelector('#status-stack');
  const comparisonBox = document.querySelector('#comparison-box');
  const comparisonList = document.querySelector('#comparison-list');
  const checklistBox = document.querySelector('#dynamic-checklist');
  const checklistList = document.querySelector('#checklist-list');
  const businessInput = document.querySelector('#business-number');
  const startDateInput = document.querySelector('#start-date');

  const scope = form.dataset.scope || 'full';
  const submitLabel = form.dataset.submitLabel || '사업자 정보 확인하기';
  const loadingLabel = form.dataset.loadingLabel || '확인 중입니다...';

  const visibleScopes = {
    status: { status: true, validate: false, mailOrder: false, comparison: false, checklist: true },
    validate: { status: true, validate: true, mailOrder: false, comparison: false, checklist: true },
    'mail-order': { status: false, validate: false, mailOrder: true, comparison: false, checklist: true },
    compare: { status: true, validate: true, mailOrder: true, comparison: true, checklist: true },
    checklist: { status: true, validate: false, mailOrder: true, comparison: true, checklist: true },
    full: { status: true, validate: true, mailOrder: true, comparison: true, checklist: true }
  };

  const currentScope = visibleScopes[scope] || visibleScopes.full;

  const formatBusinessNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const formatDate = (value) => value.replace(/\D/g, '').slice(0, 8);

  businessInput?.addEventListener('input', (event) => {
    event.target.value = formatBusinessNumber(event.target.value);
  });

  startDateInput?.addEventListener('input', (event) => {
    event.target.value = formatDate(event.target.value);
  });

  const setMessage = (message, type = 'info') => {
    if (!message) {
      resultMessage.hidden = true;
      resultMessage.textContent = '';
      resultMessage.className = 'message-box';
      return;
    }
    resultMessage.hidden = false;
    resultMessage.textContent = message;
    resultMessage.className = `message-box ${type === 'error' ? 'error' : ''}`;
  };

  const setLoading = (isLoading) => {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? loadingLabel : submitLabel;
    resultPanel.hidden = false;
    if (isLoading) {
      resultUpdated.textContent = '조회 중';
      resultUpdated.className = 'status-pill neutral';
      setMessage('공식 API 조회를 진행하고 있습니다. 잠시만 기다려 주세요.');
      statusStack.innerHTML = statusCard({
        icon: 'i',
        tone: 'neutral',
        title: '조회 중입니다',
        description: '필요한 공식 정보를 확인하고 있습니다.',
        pill: '조회 중'
      });
      comparisonBox.hidden = true;
      checklistBox.hidden = true;
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const statusCard = ({ icon, tone, title, description, pill }) => `
    <article class="status-card">
      <span class="status-icon ${tone}" aria-hidden="true">${escapeHtml(icon)}</span>
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
      <em class="status-pill ${tone}">${escapeHtml(pill)}</em>
    </article>
  `;

  const comparisonRow = ({ label, input, official, status, tone }) => `
    <div class="result-row">
      <span>${escapeHtml(label)} <em class="status-pill ${tone}">${escapeHtml(status)}</em></span>
      <strong>${escapeHtml(input || '입력 없음')} → ${escapeHtml(official || '공식 정보 없음')}</strong>
    </div>
  `;

  const collectPayload = () => {
    const data = new FormData(form);
    return {
      mode: scope,
      businessNumber: String(data.get('businessNumber') || '').trim(),
      storeName: String(data.get('storeName') || '').trim(),
      representativeName: String(data.get('representativeName') || '').trim(),
      startDate: String(data.get('startDate') || '').trim(),
      permitNumber: String(data.get('permitNumber') || '').trim(),
      storeUrl: String(data.get('storeUrl') || '').trim()
    };
  };

  const renderResults = (payload) => {
    const status = payload.businessStatus || {};
    const validate = payload.businessValidate || {};
    const mailOrder = payload.mailOrder || {};
    const messages = payload.messages || [];
    const comparisons = payload.comparisons || [];
    const checklist = payload.checklist || [];

    resultUpdated.textContent = payload.checkedAt ? new Date(payload.checkedAt).toLocaleString('ko-KR') : '조회 완료';
    resultUpdated.className = 'status-pill success';
    setMessage(messages[0] || '조회가 완료되었습니다. 이 결과는 공식 등록정보 확인용이며, 사기 여부나 거래 안전성을 판정하지 않습니다.');

    const cards = [];
    if (currentScope.status) {
      const statusTone = status.tone || 'neutral';
      const statusIcon = statusTone === 'success' ? '✓' : statusTone === 'warning' ? '!' : statusTone === 'danger' ? '!' : 'i';
      cards.push(statusCard({
        icon: statusIcon,
        tone: statusTone,
        title: '사업자등록 상태',
        description: status.summary || '조회 결과가 없습니다.',
        pill: status.label || '확인 필요'
      }));
    }
    if (currentScope.validate) {
      const validateTone = validate.checked ? (validate.valid ? 'success' : 'warning') : 'neutral';
      cards.push(statusCard({
        icon: validateTone === 'success' ? '✓' : 'i',
        tone: validateTone,
        title: '사업자 진위확인',
        description: validate.summary || '개업일자와 대표자명을 입력하면 진위확인을 함께 시도합니다.',
        pill: validate.checked ? (validate.valid ? '일치' : '확인 필요') : '선택'
      }));
    }
    if (currentScope.mailOrder) {
      const ftcTone = mailOrder.found ? 'success' : (mailOrder.error ? 'warning' : 'neutral');
      const ftcIcon = mailOrder.found ? '✓' : 'i';
      cards.push(statusCard({
        icon: ftcIcon,
        tone: ftcTone,
        title: '통신판매업 정보',
        description: mailOrder.summary || '통신판매업 등록상세 조회 결과가 없습니다.',
        pill: mailOrder.found ? '확인됨' : (mailOrder.error ? '확인 필요' : '정보 없음')
      }));
    }

    statusStack.innerHTML = cards.join('') || statusCard({
      icon: 'i',
      tone: 'neutral',
      title: '조회 완료',
      description: '확인 가능한 항목이 없습니다.',
      pill: '완료'
    });

    if (currentScope.comparison && comparisons.length) {
      comparisonBox.hidden = false;
      comparisonList.innerHTML = comparisons.map(comparisonRow).join('');
    } else {
      comparisonBox.hidden = true;
      comparisonList.innerHTML = '';
    }

    if (currentScope.checklist && checklist.length) {
      checklistBox.hidden = false;
      checklistList.innerHTML = checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    } else {
      checklistBox.hidden = true;
      checklistList.innerHTML = '';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectPayload();
    const digits = payload.businessNumber.replace(/\D/g, '');

    if (digits.length !== 10) {
      resultPanel.hidden = false;
      resultUpdated.textContent = '입력 확인';
      resultUpdated.className = 'status-pill warning';
      setMessage('사업자등록번호는 숫자 10자리로 입력해야 합니다.', 'error');
      statusStack.innerHTML = statusCard({
        icon: '!',
        tone: 'warning',
        title: '입력값 확인 필요',
        description: '사업자등록번호 형식을 다시 확인해 주세요.',
        pill: '확인 필요'
      });
      comparisonBox.hidden = true;
      checklistBox.hidden = true;
      return;
    }

    if (scope === 'validate') {
      const startDate = payload.startDate.replace(/\D/g, '');
      if (!payload.representativeName || startDate.length !== 8) {
        resultPanel.hidden = false;
        resultUpdated.textContent = '입력 확인';
        resultUpdated.className = 'status-pill warning';
        setMessage('진위확인은 대표자명과 YYYYMMDD 형식의 개업일자가 필요합니다.', 'error');
        statusStack.innerHTML = statusCard({
          icon: '!',
          tone: 'warning',
          title: '필수 입력값 확인 필요',
          description: '대표자명과 개업일자를 다시 확인해 주세요.',
          pill: '확인 필요'
        });
        comparisonBox.hidden = true;
        checklistBox.hidden = true;
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || '조회 중 오류가 발생했습니다.');
      }
      renderResults(result);
    } catch (error) {
      resultUpdated.textContent = '오류';
      resultUpdated.className = 'status-pill warning';
      setMessage(error.message || '조회 중 오류가 발생했습니다.', 'error');
      statusStack.innerHTML = statusCard({
        icon: '!',
        tone: 'warning',
        title: '조회 실패',
        description: 'API 키 설정, 공공데이터포털 활용신청 상태, 네트워크 상태를 확인해 주세요. 입력값은 별도 DB에 저장하지 않습니다.',
        pill: '확인 필요'
      });
      comparisonBox.hidden = true;
      checklistBox.hidden = true;
    } finally {
      setLoading(false);
    }
  });
})();
