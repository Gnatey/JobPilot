import type { NextRequest } from "next/server";
import { handleAuthReturn } from "@/lib/auth-callback";

export const GET = (req: NextRequest) => handleAuthReturn(req, false);
