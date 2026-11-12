"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import { updateProfile as updateProfileUseCase } from "@/services/profile/update-profile";
import {
  addQualification as addQualificationUseCase,
  removeQualification as removeQualificationUseCase,
} from "@/services/profile/qualifications";
import {
  addStatus as addStatusUseCase,
  removeStatus as removeStatusUseCase,
} from "@/services/profile/statuses";

// Every action below re-derives "who is this" from the server-side session
// via requireUser() and passes only that id into the services/profile use
// case — never a client-supplied id (CLAUDE.md: "never trust client-side
// authorization"; SECURITY.md §5's two-layer requirement, with RLS as the
// independent second layer underneath each services/db call).

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/profile");

  const result = await updateProfileUseCase(supabase, user.id, {
    fullName: formData.get("fullName"),
    dateOfBirth: formData.get("dateOfBirth"),
    categoryId: formData.get("categoryId"),
    stateId: formData.get("stateId"),
    domicileStateId: formData.get("domicileStateId"),
    educationLevelId: formData.get("educationLevelId"),
    gender: formData.get("gender"),
    experienceYears: formData.get("experienceYears"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: result.error,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    };
  }
  revalidatePath("/profile");
  return { status: "success", message: "Profile updated." };
}

export async function addQualificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/profile");

  const result = await addQualificationUseCase(supabase, user.id, {
    qualificationId: formData.get("qualificationId"),
    institution: formData.get("institution"),
    yearCompleted: formData.get("yearCompleted"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: result.error,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    };
  }
  revalidatePath("/profile");
  return { status: "success", message: "Qualification added." };
}

export async function removeQualificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/profile");

  const result = await removeQualificationUseCase(supabase, user.id, {
    id: formData.get("id"),
  });

  if (!result.success) {
    return { status: "error", message: result.error };
  }
  revalidatePath("/profile");
  return { status: "success", message: "Qualification removed." };
}

export async function addStatusAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/profile");

  const result = await addStatusUseCase(supabase, user.id, {
    statusId: formData.get("statusId"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: result.error,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    };
  }
  revalidatePath("/profile");
  return { status: "success", message: "Status added." };
}

export async function removeStatusAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/profile");

  const result = await removeStatusUseCase(supabase, user.id, {
    id: formData.get("id"),
  });

  if (!result.success) {
    return { status: "error", message: result.error };
  }
  revalidatePath("/profile");
  return { status: "success", message: "Status removed." };
}
