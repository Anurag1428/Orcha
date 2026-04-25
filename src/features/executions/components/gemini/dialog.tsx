import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  variableName: z.string().min(1, "Variable name is required"),
  prompt: z.string().min(1, "Prompt is required"),
});

export type GeminiFormValues = z.infer<typeof formSchema>;

interface GeminiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GeminiFormValues) => void;
  defaultValues?: Partial<GeminiFormValues>;
}

export const GeminiDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
}: GeminiDialogProps) => {
  const form = useForm<GeminiFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues?.variableName || "aiResponse",
      prompt: defaultValues?.prompt || "",
    },
  });

  useEffect(() => {
    if (open && defaultValues) {
      form.reset({
        variableName: defaultValues.variableName || "aiResponse",
        prompt: defaultValues.prompt || "",
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: GeminiFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Gemini (Kimi) Node Settings</DialogTitle>
          <DialogDescription>
            Configure the Kimi prompt for text generation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. aiResponse" {...field} />
                  </FormControl>
                  <FormDescription>
                    The variable to store the AI's response in.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Write a poem about {{trigger.topic}}" 
                      className="min-h-[150px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    You can use Handlebars syntax to reference previous variables.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
