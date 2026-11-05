import type { NextRequest } from "next/server";
import { handleAuthReturn } from "@/lib/auth-callback";

// Lien du mail de confirmation d'inscription : comme /auth/callback, avec en plus le message « adresse confirmée »
export const GET = (req: NextRequest) => handleAuthReturn(req, true);
