import { IsNotEmptyObject } from 'class-validator';

export class CorrectionDTO {
  /**
   * The reviewer field is intentionally OMITTED — it is sourced from
   * the authenticated principal (request.user.email) by the controller.
   * Trusting body input here would let any caller impersonate anyone.
   */
  @IsNotEmptyObject()
  correctedOcsf!: Record<string, any>;
}
