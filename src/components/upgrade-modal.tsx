"use client"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { authClient } from "@/lib/auth-client"
import { AlertCircle } from "lucide-react";

interface UpgradeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export const UpgradeModal = ({ 
    open, 
    onOpenChange 
}: 
    UpgradeModalProps) => {
        return (
            <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Upgrade to Pro
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        You have reached the limit of free workflows. Upgrade to Pro to unlock all workflows.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => authClient.checkout({slug: "pro"})}
                        >
                            Upgrade Now
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>    
            </AlertDialog>
        )
    };