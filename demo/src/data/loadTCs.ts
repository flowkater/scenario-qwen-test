import { TCData, TCGroup, TC_GROUPS } from '../types'

// Input TCs
import tc01Input from '../../../data/input/tc-01-tyler-econ.json'
import tc02Input from '../../../data/input/tc-02-emma-genetics.json'
import tc03Input from '../../../data/input/tc-03-tyler-b-econ-complete.json'
import tc04Input from '../../../data/input/tc-04-marcus-orgo-distracted.json'
import tc05Input from '../../../data/input/tc-05-emma-b-genetics-panic.json'
import tc06Input from '../../../data/input/tc-06-priya-polisci-essay.json'
import tc07Input from '../../../data/input/tc-07-orgo-senior-retaker.json'
import tc08Input from '../../../data/input/tc-08-med-anatomy-atlas.json'
import tc09Input from '../../../data/input/tc-09-all-unknown.json'
import tc10Input from '../../../data/input/tc-10-over-budget-crisis.json'
import tc11Input from '../../../data/input/tc-11-sat-math.json'
import tc12Input from '../../../data/input/tc-12-suneung-korean.json'
import tc13Input from '../../../data/input/tc-13-ap-chemistry.json'
import tc14Input from '../../../data/input/tc-14-cpa-retake.json'
import tc15Input from '../../../data/input/tc-15-pmp-working-pro.json'
import tc16Input from '../../../data/input/tc-16-jlpt-n2.json'
import tc17Input from '../../../data/input/tc-17-bar-exam-fulltime.json'
import tc18Input from '../../../data/input/tc-18-jungbo-cert-noncs.json'
import tc19Input from '../../../data/input/tc-19-polisci-discussion.json'
import tc20Input from '../../../data/input/tc-20-atomic-habits.json'
import tc21Input from '../../../data/input/tc-21-phd-papers.json'
import tc22Input from '../../../data/input/tc-22-harry-potter-korean.json'
import tc23Input from '../../../data/input/tc-23-constitutional-law.json'
import tc24Input from '../../../data/input/tc-24-essay-5page.json'
import tc25Input from '../../../data/input/tc-25-group-presentation.json'
import tc26Input from '../../../data/input/tc-26-calculus-homework.json'
import tc27Input from '../../../data/input/tc-27-physics-lectures.json'
import tc28Input from '../../../data/input/tc-28-udemy-react.json'
import tc29Input from '../../../data/input/tc-29-realtor-exam-korean.json'
import tc30Input from '../../../data/input/tc-30-jlpt-n2-vocab.json'
import tc31Input from '../../../data/input/tc-31-suneung-math-problems.json'
import tc32Input from '../../../data/input/tc-32-portfolio-coding.json'
import tc33Input from '../../../data/input/tc-33-orgo-freshman.json'
import tc34Input from '../../../data/input/tc-34-orgo-junior-retake.json'
import tc35Input from '../../../data/input/tc-35-orgo-senior-lastchance.json'
import tc36Input from '../../../data/input/tc-36-toefl-3-profiles.json'
import tc37Input from '../../../data/input/tc-37-replan-shame-exam-delayed.json'
import tc38Input from '../../../data/input/tc-38-replan-burnout-bar-exam.json'
import tc39Input from '../../../data/input/tc-39-replan-frustration-mock-exam.json'
import tc40Input from '../../../data/input/tc-40-multi-subject-midterm-3-same-week.json'
import tc41Input from '../../../data/input/tc-41-multi-subject-csat-kor-eng-math.json'
import tc42Input from '../../../data/input/tc-42-multi-subject-cpa-far-reg.json'

// Expected TCs
import tc01Expected from '../../../data/expected/tc-01-tyler-econ.json'
import tc02Expected from '../../../data/expected/tc-02-emma-genetics.json'
import tc03Expected from '../../../data/expected/tc-03-tyler-b-econ-complete.json'
import tc04Expected from '../../../data/expected/tc-04-marcus-orgo-distracted.json'
import tc05Expected from '../../../data/expected/tc-05-emma-b-genetics-panic.json'
import tc06Expected from '../../../data/expected/tc-06-priya-polisci-essay.json'
import tc07Expected from '../../../data/expected/tc-07-orgo-senior-retaker.json'
import tc08Expected from '../../../data/expected/tc-08-med-anatomy-atlas.json'
import tc09Expected from '../../../data/expected/tc-09-all-unknown.json'
import tc10Expected from '../../../data/expected/tc-10-over-budget-crisis.json'
import tc11Expected from '../../../data/expected/tc-11-sat-math.json'
import tc12Expected from '../../../data/expected/tc-12-suneung-korean.json'
import tc13Expected from '../../../data/expected/tc-13-ap-chemistry.json'
import tc14Expected from '../../../data/expected/tc-14-cpa-retake.json'
import tc15Expected from '../../../data/expected/tc-15-pmp-working-pro.json'
import tc16Expected from '../../../data/expected/tc-16-jlpt-n2.json'
import tc17Expected from '../../../data/expected/tc-17-bar-exam-fulltime.json'
import tc18Expected from '../../../data/expected/tc-18-jungbo-cert-noncs.json'
import tc19Expected from '../../../data/expected/tc-19-polisci-discussion.json'
import tc20Expected from '../../../data/expected/tc-20-atomic-habits.json'
import tc21Expected from '../../../data/expected/tc-21-phd-papers.json'
import tc22Expected from '../../../data/expected/tc-22-harry-potter-korean.json'
import tc23Expected from '../../../data/expected/tc-23-constitutional-law.json'
import tc24Expected from '../../../data/expected/tc-24-essay-5page.json'
import tc25Expected from '../../../data/expected/tc-25-group-presentation.json'
import tc26Expected from '../../../data/expected/tc-26-calculus-homework.json'
import tc27Expected from '../../../data/expected/tc-27-physics-lectures.json'
import tc28Expected from '../../../data/expected/tc-28-udemy-react.json'
import tc29Expected from '../../../data/expected/tc-29-realtor-exam-korean.json'
import tc30Expected from '../../../data/expected/tc-30-jlpt-n2-vocab.json'
import tc31Expected from '../../../data/expected/tc-31-suneung-math-problems.json'
import tc32Expected from '../../../data/expected/tc-32-portfolio-coding.json'
import tc33Expected from '../../../data/expected/tc-33-orgo-freshman.json'
import tc34Expected from '../../../data/expected/tc-34-orgo-junior-retake.json'
import tc35Expected from '../../../data/expected/tc-35-orgo-senior-lastchance.json'
import tc36Expected from '../../../data/expected/tc-36-toefl-3-profiles.json'
import tc37Expected from '../../../data/expected/tc-37-replan-shame-exam-delayed.json'
import tc38Expected from '../../../data/expected/tc-38-replan-burnout-bar-exam.json'
import tc39Expected from '../../../data/expected/tc-39-replan-frustration-mock-exam.json'
import tc40Expected from '../../../data/expected/tc-40-multi-subject-midterm-3-same-week.json'
import tc41Expected from '../../../data/expected/tc-41-multi-subject-csat-kor-eng-math.json'
import tc42Expected from '../../../data/expected/tc-42-multi-subject-cpa-far-reg.json'

function getGroup(num: number): TCGroup {
  for (const [g, info] of Object.entries(TC_GROUPS)) {
    if (num >= info.range[0] && num <= info.range[1]) return g as TCGroup
  }
  return 'A'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTCData(input: any, expected: any): TCData {
  const numStr = input.id.replace('tc-', '')
  const num = parseInt(numStr, 10)
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    group: getGroup(num),
    input,
    expected,
  }
}

export const ALL_TCS: TCData[] = [
  makeTCData(tc01Input, tc01Expected),
  makeTCData(tc02Input, tc02Expected),
  makeTCData(tc03Input, tc03Expected),
  makeTCData(tc04Input, tc04Expected),
  makeTCData(tc05Input, tc05Expected),
  makeTCData(tc06Input, tc06Expected),
  makeTCData(tc07Input, tc07Expected),
  makeTCData(tc08Input, tc08Expected),
  makeTCData(tc09Input, tc09Expected),
  makeTCData(tc10Input, tc10Expected),
  makeTCData(tc11Input, tc11Expected),
  makeTCData(tc12Input, tc12Expected),
  makeTCData(tc13Input, tc13Expected),
  makeTCData(tc14Input, tc14Expected),
  makeTCData(tc15Input, tc15Expected),
  makeTCData(tc16Input, tc16Expected),
  makeTCData(tc17Input, tc17Expected),
  makeTCData(tc18Input, tc18Expected),
  makeTCData(tc19Input, tc19Expected),
  makeTCData(tc20Input, tc20Expected),
  makeTCData(tc21Input, tc21Expected),
  makeTCData(tc22Input, tc22Expected),
  makeTCData(tc23Input, tc23Expected),
  makeTCData(tc24Input, tc24Expected),
  makeTCData(tc25Input, tc25Expected),
  makeTCData(tc26Input, tc26Expected),
  makeTCData(tc27Input, tc27Expected),
  makeTCData(tc28Input, tc28Expected),
  makeTCData(tc29Input, tc29Expected),
  makeTCData(tc30Input, tc30Expected),
  makeTCData(tc31Input, tc31Expected),
  makeTCData(tc32Input, tc32Expected),
  makeTCData(tc33Input, tc33Expected),
  makeTCData(tc34Input, tc34Expected),
  makeTCData(tc35Input, tc35Expected),
  makeTCData(tc36Input, tc36Expected),
  makeTCData(tc37Input, tc37Expected),
  makeTCData(tc38Input, tc38Expected),
  makeTCData(tc39Input, tc39Expected),
  makeTCData(tc40Input, tc40Expected),
  makeTCData(tc41Input, tc41Expected),
  makeTCData(tc42Input, tc42Expected),
]
