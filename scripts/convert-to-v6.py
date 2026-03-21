#!/usr/bin/env python3
"""Convert legacy-v4 TCs to v6 multi-path format."""
import json, glob, os, sys

def load_legacy(tc_id):
    """Load legacy input + expected for a TC."""
    inp_files = glob.glob(f"data/legacy-v4/input/{tc_id}-*.json")
    exp_files = glob.glob(f"data/legacy-v4/expected/{tc_id}-*.json")
    if not inp_files or not exp_files:
        return None, None
    return json.load(open(inp_files[0])), json.load(open(exp_files[0]))

def determine_path(category):
    """Map category to path letter."""
    if "exam" in category or "cross" in category:
        return "E"
    elif "read" in category:
        return "R"
    elif "assign" in category:
        return "A"
    elif "watch" in category:
        return "W"
    elif "practice" in category or "skill" in category:
        return "P"
    elif "multi" in category:
        return "E"
    elif "replan" in category:
        return "E"
    else:
        return "O"

def build_choices_for_question(question_type):
    """Generate default choices based on question type."""
    if "quantity" in question_type or "problems" in question_type or "count" in question_type:
        return [
            {"id": "1", "text": "50개 이하"},
            {"id": "2", "text": "50-100개"},
            {"id": "3", "text": "100개 이상"},
            {"id": "free", "text": "직접 입력"},
            {"id": "idk", "text": "🤷 잘 모르겠어"}
        ]
    elif "difficulty" in question_type or "weak" in question_type or "hard" in question_type:
        return [
            {"id": "1", "text": "있어, 특정 부분이 어려워"},
            {"id": "2", "text": "전체적으로 어려워"},
            {"id": "3", "text": "대체로 괜찮아"},
            {"id": "free", "text": "직접 입력"},
            {"id": "idk", "text": "🤷 아직 잘 모르겠어"}
        ]
    elif "speed" in question_type or "playback" in question_type:
        return [
            {"id": "1", "text": "1배속"},
            {"id": "2", "text": "1.5배속"},
            {"id": "3", "text": "2배속"},
            {"id": "free", "text": "직접 입력"},
            {"id": "idk", "text": "🤷 잘 모르겠어"}
        ]
    else:
        return [
            {"id": "1", "text": "옵션 1"},
            {"id": "2", "text": "옵션 2"},
            {"id": "3", "text": "옵션 3"},
            {"id": "free", "text": "직접 입력"},
            {"id": "idk", "text": "🤷 잘 모르겠어"}
        ]

def get_emotion_must_not_say(emotion):
    """Get mustNotSay list per emotion."""
    return {
        "neutral": [],
        "frustration": ["try harder", "focus more", "just study more", "더 집중해"],
        "panic": ["calm down", "don't worry", "relax", "걱정하지 마"],
        "shame": ["why didn't you", "you should have", "왜 안 했어"],
        "burnout": ["push through", "just keep going", "좀만 더 해"]
    }.get(emotion, [])

def build_v6(tc_id, inp, exp):
    """Build v6 TC with 3 paths."""
    category = inp.get("category", "exam-university")
    path_letter = determine_path(category)
    emotion = exp.get("emotionProtocol", inp.get("emotionProtocol", "neutral"))
    user_msg = inp.get("userMessage", "")
    
    # Profile
    profile = inp.get("profile", {})
    if "timeBudget" not in profile:
        profile["timeBudget"] = {"weekday": 120, "weekend": 120}
    
    # Expected data
    time_fit = exp.get("expectedTimeFit", "fits")
    strategies = exp.get("expectedStrategy", [])
    has_questions = bool(exp.get("expectedQuestions", {}).get("required", []))
    required_qs = exp.get("expectedQuestions", {}).get("required", [])
    
    # Determine if exam path for CPI
    is_exam = path_letter == "E"
    
    # Build CPI block
    cpi_block = {
        "coverage": "전체 대비 커버리지 % 명시",
        "practice": "인출 연습 제안 (문제풀기 or 셀프테스트)",
        "insight": "이해도 확인 제안 (틀린 문제 복습 등)"
    } if is_exam else {
        "coverage": "전체 대비 커버리지 % 명시 (해당 시)",
        "practice": "선택적",
        "insight": "선택적"
    }
    
    # Build mustInclude for plan generation
    must_include = {
        "smart": {
            "specific": "자료별 분량이 구체적으로 분리된 plan",
            "measurable": "dailyTarget이 숫자로 명시",
            "achievable": f"profile 반영 (focusSpan={profile.get('focusSpan', 'N/A')}, level={profile.get('level', 'N/A')}), timeFit={time_fit}",
            "relevant": "약점/우선순위 반영" if has_questions else "상황에 맞는 분배",
            "timeBound": "마감 기반 일정 역산"
        },
        "cpi": cpi_block,
        "coach": {
            "diagnosis": f"profile + 유저 답변 기반 상황 파악",
            "strategy": f"timeFit={time_fit} 맞는 전략" + (" + 대안 2개+" if time_fit in ["deficit", "impossible"] else ""),
            "honesty": f"timeFit={time_fit} 솔직 전달" + (" + 대안 제시" if time_fit in ["deficit", "impossible"] else ""),
            "emotion": f"{emotion} 톤 적절, mustNotSay 위반 없음"
        }
    }
    
    # ---- PATH A: Golden Path ----
    if has_questions:
        # Multi-turn: ask then plan
        path_a = {
            "label": "Golden Path (핵심 정보 제공)",
            "conversation": [
                {
                    "turn": 1,
                    "user": user_msg,
                    "expectedAI": {
                        "action": "ask",
                        "question": required_qs[0] if required_qs else "추가 정보",
                        "choices": build_choices_for_question(required_qs[0] if required_qs else ""),
                        "mustNotDo": ["분량 모른 채 plan 생성", "focusSpan 다시 물어보기"]
                    }
                },
                {
                    "turn": 2,
                    "user": f"(유저가 구체적 답변 제공 — 약점 특정, 분량 확인 등)",
                    "expectedAI": {
                        "action": "generate_plan",
                        "mustInclude": must_include
                    }
                }
            ]
        }
    else:
        # Single-turn: straight to plan
        path_a = {
            "label": "Golden Path (정보 충분)",
            "conversation": [
                {
                    "turn": 1,
                    "user": user_msg,
                    "expectedAI": {
                        "action": "generate_plan",
                        "mustInclude": must_include
                    }
                }
            ]
        }
    
    # ---- PATH B: Variant (다른 핵심 선택) ----
    variant_include = json.loads(json.dumps(must_include))  # deep copy
    variant_include["coach"]["strategy"] = f"Path A와 다른 전략 (다른 선택지 반영)"
    
    if has_questions:
        path_b = {
            "label": "Variant (다른 핵심 선택 → 다른 plan)",
            "conversation": [
                {
                    "turn": 1,
                    "user": user_msg,
                    "expectedAI": {
                        "action": "ask",
                        "question": required_qs[0] if required_qs else "추가 정보"
                    }
                },
                {
                    "turn": 2,
                    "user": f"(유저가 Path A와 다른 답변 — 전체 어려움, 다른 전략 선호 등)",
                    "expectedAI": {
                        "action": "generate_plan",
                        "mustDifferFrom": "path_A",
                        "mustInclude": variant_include
                    }
                }
            ]
        }
    else:
        path_b = {
            "label": "Variant (다른 조건에서 plan)",
            "conversation": [
                {
                    "turn": 1,
                    "user": f"(Path A와 약간 다른 조건으로 같은 시나리오)",
                    "expectedAI": {
                        "action": "generate_plan",
                        "mustDifferFrom": "path_A",
                        "mustInclude": variant_include
                    }
                }
            ]
        }
    
    # ---- PATH C: 🤷 Chain ----
    idk_include = json.loads(json.dumps(must_include))  # deep copy
    idk_include["smart"]["relevant"] = "약점 모르니 Smart Default + 리밸런스 안내"
    idk_include["coach"]["strategy"] = "Smart Default + 나중에 조정 가능 안내"
    idk_include["coach"]["diagnosis"] = "정보 부족 → 추정 기반 or 기본값"
    
    path_c = {
        "label": "🤷 체인 (모르겠어 → 추정 질문 → Smart Default)",
        "conversation": [
            {
                "turn": 1,
                "user": user_msg,
                "expectedAI": {
                    "action": "ask",
                    "question": required_qs[0] if required_qs else "기본 정보 확인"
                }
            },
            {
                "turn": 2,
                "user": "🤷 잘 모르겠어요.",
                "expectedAI": {
                    "action": "ask",
                    "question": "더 쉬운 질문으로 재시도 (추정)",
                    "mustNotDo": ["분량 모른 채 plan 생성", "넘어가기"]
                }
            },
            {
                "turn": 3,
                "user": "(대략적 추정 답변 제공 or 재시도도 🤷)",
                "expectedAI": {
                    "action": "generate_plan",
                    "mustDifferFrom": "path_A",
                    "mustInclude": idk_include
                }
            }
        ]
    }
    
    # Hard fail gates
    hfgs = ["HFG-1", "HFG-4", "HFG-5"]
    if has_questions:
        hfgs.append("HFG-3")
    if emotion != "neutral":
        hfgs.append("HFG-2")
    
    return {
        "id": tc_id,
        "category": category,
        "name": inp.get("name", tc_id),
        "path": path_letter,
        "emotionProtocol": emotion,
        "profile": profile,
        "paths": {
            "A": path_a,
            "B": path_b,
            "C": path_c
        },
        "hardFailGates": sorted(set(hfgs))
    }


def main():
    os.makedirs("data/v6", exist_ok=True)
    
    # Get all TC IDs from legacy input
    tc_ids = set()
    for f in glob.glob("data/legacy-v4/input/tc-*.json"):
        d = json.load(open(f))
        tc_ids.add(d["id"])
    
    # Skip tc-04 (already manually created as sample)
    tc_ids.discard("tc-04")
    
    # Filter by command line args if provided
    if len(sys.argv) > 1:
        filter_ids = set(sys.argv[1:])
        tc_ids = tc_ids & filter_ids
    
    converted = 0
    skipped = 0
    
    for tc_id in sorted(tc_ids):
        inp, exp = load_legacy(tc_id)
        if not inp or not exp:
            print(f"SKIP {tc_id}: missing legacy files")
            skipped += 1
            continue
        
        # Special handling for tc-36 (split into 3)
        if tc_id == "tc-36":
            profiles = inp.get("profiles", [inp])
            expected_list = exp.get("profiles", [exp]) if "profiles" in exp else [exp]
            suffixes = ["a", "b", "c"]
            for i, (p, e) in enumerate(zip(profiles, expected_list)):
                if i >= 3:
                    break
                sub_id = f"tc-36{suffixes[i]}"
                sub_inp = {**inp, **p, "id": sub_id}
                sub_exp = {**exp, **e}
                v6 = build_v6(sub_id, sub_inp, sub_exp)
                out_path = f"data/v6/{sub_id}.json"
                json.dump(v6, open(out_path, "w"), indent=2, ensure_ascii=False)
                print(f"WROTE {out_path} (paths: {list(v6['paths'].keys())})")
                converted += 1
            continue
        
        v6 = build_v6(tc_id, inp, exp)
        out_path = f"data/v6/{tc_id}.json"
        json.dump(v6, open(out_path, "w"), indent=2, ensure_ascii=False)
        print(f"WROTE {out_path} (paths: {list(v6['paths'].keys())})")
        converted += 1
    
    print(f"\nConverted: {converted}, Skipped: {skipped}")
    print(f"Total v6 files: {len(glob.glob('data/v6/tc-*.json'))}")


if __name__ == "__main__":
    main()
