"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, { message: "Variable name is required" })
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message: "Variable name must start with a letter or underscore",
    }),
  startupsPath: z.string().min(1, {
    message: "Provide a context path that resolves to StartupLead[]",
  }),
  startupsJson: z.string().optional(),
  sourceUrl: z.string().optional(),
  postText: z.string().optional(),
  imageUrl: z.string().optional(),
  openaiCredentialId: z.string().optional(),
  gmailCredentialId: z.string().optional(),
  senderName: z.string().optional(),
  senderContext: z.string().optional(),
  testEmail: z.string().optional(),
  liveMode: z.boolean().optional(),
});

export type ForEachStartupFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ForEachStartupFormValues) => void;
  defaultValues?: Partial<ForEachStartupFormValues>;
}

export const ForEachStartupDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<ForEachStartupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "startupFanout",
      startupsPath: defaultValues.startupsPath || "startups",
      startupsJson: defaultValues.startupsJson || "",
      sourceUrl: defaultValues.sourceUrl || "",
      postText: defaultValues.postText || "",
      imageUrl: defaultValues.imageUrl || "",
      openaiCredentialId: defaultValues.openaiCredentialId || "",
      gmailCredentialId: defaultValues.gmailCredentialId || "",
      senderName: defaultValues.senderName || "",
      senderContext: defaultValues.senderContext || "",
      testEmail: defaultValues.testEmail || "",
      liveMode: defaultValues.liveMode || false,
    },
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      variableName: defaultValues.variableName || "startupFanout",
      startupsPath: defaultValues.startupsPath || "startups",
      startupsJson: defaultValues.startupsJson || "",
      sourceUrl: defaultValues.sourceUrl || "",
      postText: defaultValues.postText || "",
      imageUrl: defaultValues.imageUrl || "",
      openaiCredentialId: defaultValues.openaiCredentialId || "",
      gmailCredentialId: defaultValues.gmailCredentialId || "",
      senderName: defaultValues.senderName || "",
      senderContext: defaultValues.senderContext || "",
      testEmail: defaultValues.testEmail || "",
      liveMode: defaultValues.liveMode || false,
    });
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "startupFanout";

  const handleSubmit = (values: ForEachStartupFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>For Each Startup</DialogTitle>
          <DialogDescription>
            Persist a StartupLead array and create one child execution per
            startup.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="mt-4 space-y-6"
          >
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="startupFanout" {...field} />
                  </FormControl>
                  <FormDescription>
                    Later nodes can read {`{{${watchVariableName}.startups}}`}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startupsPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Startup Array Path</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="fundingExtraction.startups"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Dot path in workflow context. Supports arrays, objects with
                    a startups field, or JSON text.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startupsJson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Startup JSON Override</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[96px] font-mono text-sm"
                      placeholder="{{fundingExtraction.text}}"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional Handlebars template. When set, this overrides the
                    path above.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sourceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source URL</FormLabel>
                  <FormControl>
                    <Input placeholder="{{post.url}}" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Post Text</FormLabel>
                  <FormControl>
                    <Textarea placeholder="{{post.text}}" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input placeholder="{{post.imageUrl}}" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="openaiCredentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AI Credential ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional; falls back to NVIDIA_API_KEY"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gmailCredentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gmail Credential ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Required for Gmail send" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="senderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sender Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Anurag" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="senderContext"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sender Context</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What Orcha does and why this founder should care"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="testEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Recipient</FormLabel>
                  <FormControl>
                    <Input placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormDescription>Used when live mode is off.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
