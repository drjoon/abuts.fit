// 준비·가공 공통. 구현은 shared/autoApproval.
export {
  getMachineAutoFlags,
  publishMachineAutoFlags,
  registerMachineBusyCheck,
  subscribeMachineAutoFlags,
  useAutoApprovalGate,
} from "../../shared/autoApproval/useAutoApprovalGate";
export type {
  GateHoldItem,
  GateState,
} from "../../shared/autoApproval/useAutoApprovalGate";
