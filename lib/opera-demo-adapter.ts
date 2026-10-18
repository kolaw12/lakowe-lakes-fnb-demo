export type OperaVerificationStatus = "eligible" | "invalid_room" | "vacant" | "invalid_guest" | "charge_disabled";
export type OperaPostingStatus = "not_attempted" | "settled" | "rejected" | "unavailable" | "uncertain";
export type OperaScenario = "success" | "rejected" | "unavailable" | "uncertain";

export type RoomVerificationInput = { roomReference: string; guestSurname: string; verificationCode: string };
export type RoomVerificationResult = {
  status: OperaVerificationStatus;
  occupied: boolean;
  guestAuthorized: boolean;
  chargingPermitted: boolean;
  guestDisplayName: string | null;
  scenario: OperaScenario | null;
  reason: string | null;
};
export type FolioChargeInput = { attemptId: string; orderReference: string; roomReference: string; amount: number; scenario: OperaScenario };
export type FolioPostingResult = { status: Exclude<OperaPostingStatus, "not_attempted">; postingReference: string | null; reason: string | null };

export interface OperaAdapter {
  validateRoom(input: RoomVerificationInput): Promise<RoomVerificationResult>;
  submitFolioCharge(input: FolioChargeInput): Promise<FolioPostingResult>;
  retrievePostingResult(postingReference: string): Promise<FolioPostingResult>;
}

type DemoRoom = {
  roomReference: string; occupied: boolean; guestSurname: string | null; verificationCode: string | null;
  guestDisplayName: string | null; chargingPermitted: boolean; scenario: OperaScenario;
};

export const OPERA_DEMO_SCENARIOS = [
  { roomReference: "101", guestSurname: "Adebayo", verificationCode: "LAKE-101", outcome: "Successful simulated posting" },
  { roomReference: "202", guestSurname: "Vacant", verificationCode: "LAKE-202", outcome: "Vacant room rejection" },
  { roomReference: "303", guestSurname: "Okoro", verificationCode: "LAKE-303", outcome: "Room charging disabled" },
  { roomReference: "404", guestSurname: "Mensah", verificationCode: "LAKE-404", outcome: "Simulated posting rejection" },
  { roomReference: "505", guestSurname: "Bello", verificationCode: "LAKE-505", outcome: "Mock integration unavailable" },
  { roomReference: "606", guestSurname: "Nwosu", verificationCode: "LAKE-606", outcome: "Uncertain result requiring supervisor reconciliation" },
] as const;

const rooms: DemoRoom[] = [
  { roomReference: "101", occupied: true, guestSurname: "ADEBAYO", verificationCode: "LAKE-101", guestDisplayName: "Tola Adebayo", chargingPermitted: true, scenario: "success" },
  { roomReference: "202", occupied: false, guestSurname: null, verificationCode: null, guestDisplayName: null, chargingPermitted: false, scenario: "rejected" },
  { roomReference: "303", occupied: true, guestSurname: "OKORO", verificationCode: "LAKE-303", guestDisplayName: "Amaka Okoro", chargingPermitted: false, scenario: "rejected" },
  { roomReference: "404", occupied: true, guestSurname: "MENSAH", verificationCode: "LAKE-404", guestDisplayName: "Kojo Mensah", chargingPermitted: true, scenario: "rejected" },
  { roomReference: "505", occupied: true, guestSurname: "BELLO", verificationCode: "LAKE-505", guestDisplayName: "Ladi Bello", chargingPermitted: true, scenario: "unavailable" },
  { roomReference: "606", occupied: true, guestSurname: "NWOSU", verificationCode: "LAKE-606", guestDisplayName: "Ada Nwosu", chargingPermitted: true, scenario: "uncertain" },
];

function postingReference(input: FolioChargeInput) {
  return `OPR-DEMO-${input.scenario.toUpperCase()}-${input.attemptId.replaceAll("-", "").slice(-10).toUpperCase()}`;
}

export class MockOperaAdapter implements OperaAdapter {
  async validateRoom(input: RoomVerificationInput): Promise<RoomVerificationResult> {
    const room = rooms.find(item => item.roomReference === input.roomReference.trim());
    if (!room) return { status: "invalid_room", occupied: false, guestAuthorized: false, chargingPermitted: false, guestDisplayName: null, scenario: null, reason: "That fictional room is not present in the demo property." };
    if (!room.occupied) return { status: "vacant", occupied: false, guestAuthorized: false, chargingPermitted: false, guestDisplayName: null, scenario: room.scenario, reason: "The fictional room is vacant." };
    const authorized = room.guestSurname === input.guestSurname.trim().toUpperCase() && room.verificationCode === input.verificationCode.trim().toUpperCase();
    if (!authorized) return { status: "invalid_guest", occupied: true, guestAuthorized: false, chargingPermitted: room.chargingPermitted, guestDisplayName: null, scenario: room.scenario, reason: "The fictional guest surname or verification code did not match the occupied room." };
    if (!room.chargingPermitted) return { status: "charge_disabled", occupied: true, guestAuthorized: true, chargingPermitted: false, guestDisplayName: room.guestDisplayName, scenario: room.scenario, reason: "Room charging is disabled for this fictional stay." };
    return { status: "eligible", occupied: true, guestAuthorized: true, chargingPermitted: true, guestDisplayName: room.guestDisplayName, scenario: room.scenario, reason: null };
  }

  async submitFolioCharge(input: FolioChargeInput): Promise<FolioPostingResult> {
    if (input.scenario === "success") return { status: "settled", postingReference: postingReference(input), reason: null };
    if (input.scenario === "rejected") return { status: "rejected", postingReference: postingReference(input), reason: "The fictional folio rejected this simulated charge." };
    if (input.scenario === "unavailable") return { status: "unavailable", postingReference: null, reason: "The mock integration is unavailable. No posting was accepted." };
    return { status: "uncertain", postingReference: postingReference(input), reason: "The mock posting result is uncertain. Do not resubmit; management reconciliation is required." };
  }

  async retrievePostingResult(postingReference: string): Promise<FolioPostingResult> {
    if (postingReference.startsWith("OPR-DEMO-UNCERTAIN-")) return { status: "settled", postingReference, reason: null };
    if (postingReference.startsWith("OPR-DEMO-SUCCESS-")) return { status: "settled", postingReference, reason: null };
    if (postingReference.startsWith("OPR-DEMO-REJECTED-")) return { status: "rejected", postingReference, reason: "The fictional folio rejected this simulated charge." };
    return { status: "unavailable", postingReference, reason: "No deterministic mock result exists for that posting reference." };
  }
}

export function getOperaAdapter(): OperaAdapter {
  return new MockOperaAdapter();
}
