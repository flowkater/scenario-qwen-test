#!/usr/bin/env python3
"""Fill placeholder user messages in v6 TCs with persona-specific text."""
import json, glob, os

# Persona-specific replacement text per TC
REPLACEMENTS = {
    # exam-university tc-01~10
    "tc-01": {
        "A2": "About 30 multiple choice questions on the study guide. I think chapters 3 and 4 on supply/demand graphs are the hardest for me, maybe 30% of the material.",
        "B1": "Econ 101 midterm in 2 weeks. Mankiw textbook, 300 pages. It's all essay questions though, no multiple choice.",
        "B2": "I don't have a problem set. The whole subject feels hard honestly, I've never taken econ before.",
        "C3": "Uh maybe 5-8 per chapter? And we covered like 5 chapters I think. I don't really know what's hard yet, haven't studied much.",
    },
    "tc-02": {
        "A2": "I have the lab manual too, about 60 pages. Molecular genetics and gene regulation are definitely the hardest parts, like 40% of the material.",
        "B2": "I actually don't have a lab manual, just the textbook. And honestly everything feels equally hard this semester.",
        "C3": "Maybe? I'm not sure about the lab manual pages. And I haven't really figured out what's hard yet.",
    },
    "tc-03": {
        "A2": "I scored 72 on the last test. The graph analysis questions are where I lose the most points.",
        "B1": "Econ 101 final next week. Same textbook, 350 pages total but I've already studied about 150 pages. I need to focus on what I haven't covered.",
        "C3": "I'm not sure what I got on the midterm actually. Maybe a C? I don't really know what specifically I need to work on.",
    },
    "tc-05": {
        "A2": "I have about 4 hours today and tomorrow. I can skip some review topics I already know well, maybe 30% of the material.",
        "B2": "I only have tonight, maybe 3 hours. I don't know what to skip, everything feels important.",
        "C3": "Honestly I don't know how much time I have. Maybe a few hours? I'm panicking right now.",
    },
    "tc-06": {
        "A2": "It's a closed book essay exam. I have a study guide with key terms. I think the theory application sections are hardest.",
        "B2": "It's actually open book. I don't have a study guide though, just my textbook and notes.",
        "C3": "I'm not sure if it's open book or closed book actually. And I don't really know which sections are harder.",
    },
    "tc-07": {
        "A2": "SN1/SN2 and elimination reactions are my weakest areas. I failed those questions last time. Maybe 40% of the exam.",
        "B2": "Honestly everything is weak. I barely passed last time. I need to restart from the basics.",
        "C3": "I don't really know what's weak. I just know I failed. Maybe everything?",
    },
    "tc-08": {
        "A2": "Yes I use Anki already, about 200 cards. I have lab once a week. The upper limb anatomy is hardest for me.",
        "B2": "I don't use Anki or any flashcards. No lab access this semester. I'm just reading the atlas.",
        "C3": "I've heard of Anki but haven't tried it. Not sure which body regions are hardest yet.",
    },
    "tc-09": {
        "A2": "It's business administration, the final is in 3 weeks. I have the textbook, about 400 pages. And a problem set with maybe 50 questions.",
        "B2": "It's sociology. The exam is next month. I have lecture notes but no textbook. Maybe 100 pages of notes?",
        "C3": "Uh I'm not even sure about the exact date. Sometime in April? I think we have a textbook but I haven't bought it yet.",
    },
    "tc-10": {
        "A2": "I have the professor's PowerPoint slides, about 30 slides with key formulas. That might be more useful than the textbook.",
        "B1": "I have a physics final TOMORROW. 300 pages, 45 minutes of study time tonight. No slides, no notes, just the textbook.",
        "C3": "🤷 I don't have any other materials. Just the textbook. I don't even know where to start.",
    },
    
    # exam-highschool tc-11~13
    "tc-11": {
        "A2": "Algebra 2 and functions are my weakest. I usually get those wrong on practice tests. Maybe 40% of the math section.",
        "B2": "I'm actually decent at most of it, just need speed practice. My issue is time management, not content.",
        "C3": "I haven't taken a full practice test yet so I don't really know what's hard.",
    },
    "tc-12": {
        "A2": "비문학 추론 문제가 제일 약해요. 화작 선택했고, 문학은 괜찮아요.",
        "B2": "언매 선택인데 전체적으로 다 어려워요. 비문학이든 문학이든 시간이 부족해요.",
        "C3": "🤷 아직 모의고사를 안 봐서 뭐가 약한지 모르겠어요.",
    },
    "tc-13": {
        "A2": "I definitely want to practice FRQs. Thermochemistry and equilibrium are my weak areas, about 30% of the exam.",
        "B2": "I'd rather focus on the textbook first. I haven't done any FRQs yet and I'm not sure I'm ready for them.",
        "C3": "🤷 I don't know if I should do FRQs or textbook first. I haven't figured out my weak areas yet.",
    },
    
    # exam-cert tc-14~18
    "tc-14": {
        "A2": "종합원가계산이 제일 약해요. 표준원가는 그나마 괜찮고. 한 40% 정도가 원가계산 관련인 것 같아요.",
        "B2": "솔직히 원가계산 전체가 다 어려워요. 처음 시험 때도 그 부분에서 떨어진 거라서.",
        "C3": "🤷 어디가 약한지 정확히 모르겠어요. 점수표를 봐야 하는데 안 봤어요.",
    },
    "tc-15": {
        "A2": "I'll use Rita's as my main resource. The PMBOK is more for reference. Initiating and Closing are my weak areas.",
        "B2": "I'm going to focus on the PMBOK primarily. Rita's is too wordy for me. Not sure about specific weak areas yet.",
        "C3": "🤷 I haven't decided which book to focus on. And I'm not sure which knowledge areas are my weakest.",
    },
    "tc-16": {
        "A2": "SRS 앱 써서 외우고 있어요. 한자 읽기는 괜찮은데 청해가 약해요.",
        "B2": "아직 단어 공부를 시작 안 했어요. 교재 순서대로 하려고 하는데 뭐부터 해야 할지.",
        "C3": "🤷 어떻게 외우는 게 좋은지 모르겠어요. 그냥 교재 보고 있는데 안 외워져요.",
    },
    "tc-17": {
        "A2": "MBE is definitely weaker for me. Evidence and Con Law specifically. MEE is more manageable.",
        "B2": "Both MBE and MEE are problematic. I scored below average on the mock in all subjects.",
        "C3": "🤷 I'm not sure which section is weaker. I haven't taken a full practice exam yet.",
    },
    "tc-18": {
        "A2": "CBT 기출 위주로 하려고요. SQL이랑 알고리즘 부분이 제일 어려워요.",
        "B2": "이론부터 잡으려고요. 비전공이라 기초가 없어서 기출만 봐서는 모르겠어요.",
        "C3": "🤷 뭐부터 해야 할지 모르겠어요. 비전공이라 다 어려워요.",
    },
    
    # read tc-19~23
    "tc-19": {
        "A2": "I need to prepare discussion questions too. The theoretical frameworks in chapters 5-7 are the hardest, about 40% of the reading.",
        "B2": "I just need to skim for the key arguments. I don't need to understand every detail, just enough for class discussion.",
        "C3": "🤷 I'm not sure what the professor expects. I haven't looked at the reading list yet.",
    },
    "tc-20": {
        "B1": "I want to finish Atomic Habits in a week, reading during commute and lunch breaks. About 280 pages.",
        "C3": "🤷 I don't know how fast I read. Maybe 10 pages? Or 20? I haven't timed myself.",
    },
    "tc-21": {
        "A2": "I have a clear list of 12 papers. The methodology sections are the hardest to parse. I need to extract key findings and compare across papers.",
        "B2": "I only have 5 papers so far. I need to find more through citation chaining. Not sure how many total I'll need.",
        "C3": "🤷 I'm not sure how many papers I need. My advisor just said 'do a thorough review.' Maybe 10-15?",
    },
    "tc-22": {
        "B1": "I'm reading Harry Potter in English for language practice. 550 pages, no deadline, but I want to finish within a month.",
        "C3": "🤷 I don't know how many pages per day. Whatever feels right I guess?",
    },
    "tc-23": {
        "A2": "핵심 판례 위주로 먼저 하려고요. 헌법소원 부분이 제일 어렵고 한 60페이지 정도. 나머지는 한번 봤어요.",
        "B2": "전부 다 어려워요. 한번도 안 읽었어요. 이번 주 안에 다 해야 하는데 막막해요.",
        "C3": "🤷 어디가 어려운지 모르겠어요. 아직 안 펴봤어요.",
    },
    
    # assignment tc-24~26
    "tc-24": {
        "A2": "I have a clear outline already. The analysis section is the hardest part, about 2 pages worth. Introduction and conclusion are easier.",
        "B2": "I haven't started the outline yet. I'm not even sure what angle to take for the argument.",
        "C3": "🤷 I don't know how to structure it. Is 5 pages a lot? I've never written a paper this long.",
    },
    "tc-25": {
        "A2": "I'll handle the market analysis section, about 5 minutes of the presentation. I have some data already from a previous class.",
        "B2": "Our group hasn't divided the work yet. I might need to do the whole thing if my partners don't respond.",
        "C3": "🤷 I'm not sure what my part is yet. We haven't had a group meeting.",
    },
    "tc-26": {
        "A2": "Substitution integrals are fine, but trig substitution problems take me forever. Those are probably 10 of the 30 problems.",
        "B2": "Honestly all of it is hard. Integration by parts, trig sub, partial fractions — I struggle with everything.",
        "C3": "🤷 I haven't looked at the problem set yet. I just know it's 30 problems due in 2 days.",
    },
    
    # watch tc-27~29
    "tc-27": {
        "A2": "I know basic JavaScript. I want to code along with the lectures. I can do about 3 lectures per day at 1.5x speed.",
        "B2": "I don't know any JavaScript yet. I'll just watch for now without coding along. Maybe 2 lectures per day.",
        "C3": "🤷 I'm not sure about my pace. I've never taken an online course before.",
    },
    "tc-28": {
        "A2": "수업 복습용이라 1.5배속으로 볼 거예요. 하루에 2강씩 하면 될 것 같아요. 기출도 같이 풀려고요.",
        "B2": "독학이라 정속으로 봐야 해요. 하루에 1강이 한계일 것 같아요. 기출은 아직 안 풀어봤어요.",
        "C3": "🤷 배속을 뭘로 해야 할지 모르겠어요. 기출도 같이 해야 하는 건가요?",
    },
    "tc-29": {
        "A2": "I want to focus on the mechanism lectures. I'll take notes and do textbook problems alongside. 1.5x speed should work since I've seen some content before.",
        "B2": "I need to watch everything from scratch. Can't do 1.5x since it's all new to me. And I don't have a textbook.",
        "C3": "🤷 I don't know which lectures to prioritize. And I haven't decided on playback speed yet.",
    },
    
    # practice tc-30~32
    "tc-30": {
        "A2": "I've done chapters 1-5 already. Chapters 6-10 have about 150 problems. The integration problems are hardest, maybe 40% of them.",
        "B2": "I haven't started the problem set at all. I'm not sure which chapters to prioritize.",
        "C3": "🤷 I don't know how many problems are in each chapter. I just know the total is around 150.",
    },
    "tc-31": {
        "A2": "I'm a CS major, so I know basic data structures. I want to focus on dynamic programming and graphs — those are my weak areas, about 40 problems.",
        "B2": "I'm not a CS major. I only know arrays and hashmaps. I need to start from the basics — two pointers, sliding window.",
        "C3": "🤷 I don't know which types of problems to focus on. I just know I need to do 100 LeetCode problems for interview prep.",
    },
    "tc-32": {
        "A2": "Anki로 하루 20장씩 하려고요. N3는 합격했어서 기초 한자는 알아요. 한자 읽기는 괜찮은데 뜻이 헷갈려요.",
        "B2": "Anki 써본 적 없어요. 종이 카드로 하려고요. 하루에 10장이 한계일 것 같아요.",
        "C3": "🤷 어떤 방법으로 외워야 할지 모르겠어요. 그냥 교재 보고 있는데 안 외워져요.",
    },
    
    # cross-profile tc-33~36
    "tc-33": {
        "A2": "I just started orgo this semester. Reactions and nomenclature are the hardest. I have a study group that meets twice a week.",
        "B2": "I'm doing this independently, no study group. The textbook is really dense and I struggle with all of it.",
        "C3": "🤷 I don't know what's hard yet, we just started the chapter. Everything is new.",
    },
    "tc-34": {
        "A2": "This is my second time taking this. Mechanism problems specifically — I failed those last semester. I know the easy stuff already.",
        "B2": "Even the 'easy' stuff doesn't stick. I think I need to redo everything from scratch, not just mechanisms.",
        "C3": "🤷 I failed last time but I'm not sure exactly why. Maybe mechanisms? Maybe everything?",
    },
    "tc-35": {
        "A2": "이번이 마지막 기회예요. 메커니즘은 아는데 시험만 보면 머리가 하얘져요. 시험 불안인 것 같아요.",
        "B2": "사실 메커니즘도 아직 헷갈려요. 3번째인데 기초부터 다시 해야 할 것 같아요.",
        "C3": "🤷 뭐가 문제인지 모르겠어요. 공부는 하는데 성적이 안 나와요.",
    },
    "tc-36a": {
        "A2": "Reading is my weakest section. I can't finish the passages in time. Listening is okay.",
        "B2": "Actually speaking is my biggest problem, but I know TOEFL speaking is hard to practice alone. Writing is also weak.",
        "C3": "🤷 I don't know which section is weakest. I haven't taken a practice test yet.",
    },
    "tc-36b": {
        "A2": "리스닝은 괜찮은데 리딩이 시간이 부족해요. 퇴근 후 하루 1시간 정도 할 수 있어요. 주말에는 3시간.",
        "B2": "전 영역이 다 부족해요. 직장이라 평일에는 30분이 최선이에요.",
        "C3": "🤷 어떤 영역이 약한지 잘 모르겠어요. 오래전에 본 거라서.",
    },
    "tc-36c": {
        "B1": "I need to improve my Writing score from 22 to 27+. I'm applying to grad school and they specifically look at the Writing section. 90→100+ overall.",
        "C3": "🤷 I'm not sure which section to prioritize. My advisor just said I need 100+.",
    },
    
    # replan tc-37~39
    "tc-37": {
        "B1": "I fell behind on my study plan. I had 200 pages to cover in 14 days but I've only done 50 pages in the first 5 days. I think the material is just harder than I expected.",
        "C3": "🤷 I don't really know why I fell behind. I just didn't study I guess.",
    },
    "tc-38": {
        "B1": "I've been studying for the bar for 4 months and I'm completely burned out. My practice scores are actually getting worse. I planned 8 hours a day but I can barely do 4.",
        "C3": "🤷 I don't know what's wrong. I just can't study anymore. Everything feels pointless.",
    },
    "tc-39": {
        "B1": "모의고사 성적이 떨어졌어요. 국어 3등급에서 4등급으로. 비문학 독해 속도가 문제인 것 같은데 시간 관리가 안 되는 건지 잘 모르겠어요.",
        "C3": "🤷 왜 성적이 떨어졌는지 모르겠어요. 공부는 하고 있는데.",
    },
    
    # multi-subject tc-40~42
    "tc-40": {
        "B1": "I have 3 midterms in the same week: Organic Chemistry on Monday, Statistics on Wednesday, and Political Science on Friday. I'm most worried about Orgo. I have about 4 hours per day.",
        "C3": "🤷 I have 3 exams but I don't know which one to prioritize. They all feel equally hard.",
    },
    "tc-41": {
        "B1": "수능 4개월 남았어요. 국어 3등급, 수학 4등급, 영어 2등급이에요. 수학이 제일 급해요.",
        "C3": "🤷 어떤 과목에 더 시간을 쏟아야 할지 모르겠어요. 다 올려야 해요.",
    },
    "tc-42": {
        "B1": "I'm studying for CPA FAR and REG simultaneously. 10 weeks total. I failed FAR last time by 3 points. REG is new. I'm thinking about doing them parallel but not sure.",
        "C3": "🤷 I don't know if I should study both at the same time or one after the other.",
    },
}

def fill_placeholders():
    updated = 0
    for f in sorted(glob.glob("data/v6/tc-*.json")):
        d = json.load(open(f))
        tc_id = d.get("id", "")
        if "paths" not in d:
            continue
        
        changed = False
        replacements = REPLACEMENTS.get(tc_id, {})
        
        for pk in ["A", "B", "C"]:
            path = d["paths"].get(pk, {})
            for turn in path.get("conversation", []):
                user = turn.get("user", "")
                if user.startswith("("):
                    # Try to find replacement
                    key = f"{pk}{turn['turn']}"
                    if key in replacements:
                        turn["user"] = replacements[key]
                        changed = True
                    else:
                        # Generic fallback based on path
                        if pk == "C" and turn["turn"] >= 3:
                            turn["user"] = "🤷 I'm not really sure about that either. Can you just suggest something reasonable?"
                            changed = True
                        elif pk == "B" and turn["turn"] == 1:
                            # Use Path A's turn 1 user message with slight modification
                            a_msg = d["paths"]["A"]["conversation"][0].get("user", "")
                            if a_msg:
                                turn["user"] = a_msg  # Same initial message, different response later
                                changed = True
        
        if changed:
            json.dump(d, open(f, "w"), indent=2, ensure_ascii=False)
            updated += 1
            print(f"UPDATED {f}")
    
    # Recount
    placeholder = 0
    for f in sorted(glob.glob("data/v6/tc-*.json")):
        d = json.load(open(f))
        if "paths" not in d:
            continue
        for pk in ["A", "B", "C"]:
            for t in d["paths"].get(pk, {}).get("conversation", []):
                if t.get("user", "").startswith("("):
                    placeholder += 1
    
    print(f"\nUpdated: {updated} files")
    print(f"Remaining placeholders: {placeholder}")

fill_placeholders()
