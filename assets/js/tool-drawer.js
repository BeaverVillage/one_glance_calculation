const TOOL_GROUPS = [
  {
    label: "공학·학업",
    tools: [
      ["공학용 계산기", "calculators/scientific.html"],
      ["글자수·바이트 계산기", "calculators/text-counter.html"],
      ["시험 상위 백분율 계산기", "calculators/percentile.html"]
    ]
  },
  {
    label: "돈·세금",
    tools: [
      ["월 실수령액 계산기", "calculators/net-salary.html"],
      ["대출 이자 계산기", "calculators/loan-interest.html"],
      ["전세 월세 비교 계산기", "calculators/rent-vs-jeonse.html"],
      ["전세가율·보증금 위험도 계산기", "calculators/jeonse-risk.html"],
      ["실시간 환율 계산기", "calculators/exchange-rate.html"],
      ["주휴수당 계산기", "calculators/weekly-holiday-pay.html"],
      ["군적금 계산기", "calculators/military-savings.html"]
    ]
  },
  {
    label: "해외·워킹홀리데이",
    tools: [
      ["호주 급여명세서 원화 환산 계산기", "calculators/australia-pay.html"],
      ["호주 워홀 세컨비자 88일 근무일 계산기", "calculators/australia-whv-88-days.html"]
    ]
  },
  {
    label: "생활·차량",
    tools: [
      ["전기차 충전비 vs 주유비 계산기", "calculators/ev-vs-gas.html"],
      ["가전제품 월 전기요금 계산기", "calculators/appliance-electricity.html"],
      ["중고 전자제품 가격 계산기", "calculators/used-device-price.html"],
      ["주차비 계산 지도", "calculators/parking-budget-map.html"]
    ]
  },
  {
    label: "건강·습관",
    tools: [
      ["BMI 계산기", "calculators/bmi.html"],
      ["카페인 수면 영향 계산기", "calculators/caffeine-sleep.html"],
      ["금연 비용 절감 계산기", "calculators/cigarette-cost.html"]
    ]
  },
  {
    label: "재미·상상",
    tools: [
      ["우주 이동 시간 계산기", "calculators/space-travel.html"]
    ]
  }
];

export function initToolDrawer() {
  if (document.body?.dataset.toolDrawerStandaloneBound === "true") return;
  document.body.dataset.toolDrawerStandaloneBound = "true";

  const prefix = location.pathname.includes("/calculators/") ? "../" : "";
  let drawer = document.querySelector(".tool-drawer");
  let backdrop = document.querySelector(".drawer-backdrop");

  if (!drawer) {
    drawer = document.createElement("aside");
    drawer.className = "tool-drawer";
    drawer.setAttribute("aria-label", "계산기 바로가기");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <div class="tool-drawer-head">
        <strong>다른 계산기</strong>
        <button type="button" class="tool-drawer-close" aria-label="계산기 바로가기 닫기">×</button>
      </div>
      <div class="tool-search-row">
        <span aria-hidden="true">⌕</span>
        <input type="search" id="tool-search" placeholder="계산기 검색..." autocomplete="off">
      </div>
      <nav class="tool-drawer-list" aria-label="계산기 분류">
        ${TOOL_GROUPS.map((group) => `
          <section class="tool-group">
            <h2>${group.label}</h2>
            ${group.tools.map(([name, href]) => `
              <a href="${prefix}${href}" data-tool-name="${name.toLowerCase()}">${name}</a>
            `).join("")}
          </section>
        `).join("")}
      </nav>
    `;
    document.body.append(drawer);
  }

  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.className = "drawer-backdrop";
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "계산기 바로가기 닫기");
    document.body.append(backdrop);
  }

  const openDrawer = () => {
    drawer.setAttribute("aria-hidden", "false");
    drawer.style.transition = "none";
    drawer.style.transform = "none";
    document.body.classList.add("drawer-open");
    if (!window.matchMedia("(max-width: 720px)").matches) {
      drawer.querySelector("#tool-search")?.focus();
    }
  };

  const closeDrawer = () => {
    drawer.setAttribute("aria-hidden", "true");
    drawer.style.transition = "";
    drawer.style.transform = "";
    document.body.classList.remove("drawer-open");
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-tool-drawer]");
    if (!trigger) return;
    event.preventDefault();
    openDrawer();
  });

  drawer.querySelector(".tool-drawer-close")?.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  drawer.querySelector("#tool-search")?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    drawer.querySelectorAll("[data-tool-name]").forEach((link) => {
      const visible = !query || link.dataset.toolName.includes(query);
      link.hidden = !visible;
    });
  });
}
