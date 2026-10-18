
"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { api } from "@/convex/_generated/api";
import {
  useConvexMutation,
  useConvexQuery,
} from "@/hooks/use-convex-query";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { toast } from "sonner";

import { ParticipantSelector } from "./participant-selector";
import { GroupSelector } from "./group-selector";
import { CategorySelector } from "./category-selector";
import { SplitSelector } from "./split-selector";

import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { getAllCategories } from "@/lib/expense-categories";

// Form schema validation
const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) =>
        !isNaN(parseFloat(val)) && parseFloat(val) > 0,
      {
        message: "Amount must be a positive number",
      }
    ),
  category: z.string().optional(),
  date: z.date(),
  paidByUserId: z.string().min(1, "Payer is required"),
  splitType: z.enum(["equal", "percentage", "exact"]),
  groupId: z.string().optional(),
});

export function ExpenseForm({
  type = "individual",
  onSuccess,
}) {
  const [participants, setParticipants] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [splits, setSplits] = useState([]);

  // Current user
  const { data: currentUser } = useConvexQuery(
    api.users.getCurrentUser
  );

  // Expense mutation
  const createExpense = useConvexMutation(
    api.expenses.createExpense
  );

  const categories = getAllCategories();

  // Form setup
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: "",
      category: "",
      date: new Date(),
      paidByUserId: "",
      splitType: "equal",
      groupId: undefined,
    },
  });

  // Subscribe to individual fields instead of using watch()
  const amountValue = useWatch({
    control,
    name: "amount",
  });

  const paidByUserId = useWatch({
    control,
    name: "paidByUserId",
  });

  // Derive the participant list without updating state in an effect
  const expenseParticipants =
    participants.length > 0
      ? participants
      : currentUser
        ? [
            {
              id: currentUser._id,
              name: currentUser.name,
              email: currentUser.email,
              imageUrl: currentUser.imageUrl,
            },
          ]
        : [];

  // Use the current user as the default payer when no payer is selected
  const effectivePayerId =
    paidByUserId ||
    (type === "group" && selectedGroup
      ? expenseParticipants.find(
          (participant) =>
            participant.id === currentUser?._id
        )?.id || expenseParticipants[0]?.id || ""
      : currentUser?._id || "");

  // Handle form submission
  const onSubmit = async (data) => {
    try {
      if (!currentUser) {
        toast.error("User information is not available.");
        return;
      }

      if (
        type === "group" &&
        !selectedGroup
      ) {
        toast.error("Please select a group.");
        return;
      }

      if (expenseParticipants.length <= 1) {
        toast.error(
          "Please add at least one other participant."
        );
        return;
      }

      const amount = parseFloat(data.amount);
      const payerId = data.paidByUserId || effectivePayerId;

      if (!payerId) {
        toast.error("Please select who paid.");
        return;
      }

      // Ensure the selected payer belongs to the current participants
      const payerExists = expenseParticipants.some(
        (participant) => participant.id === payerId
      );

      if (!payerExists) {
        toast.error(
          "The selected payer is not a participant."
        );
        return;
      }

      // Prepare splits for the Convex mutation
      let activeSplits = splits;
      if (
        (data.splitType === "equal" || activeSplits.length === 0) &&
        expenseParticipants.length > 0
      ) {
        const shareAmount = amount / expenseParticipants.length;
        activeSplits = expenseParticipants.map((participant) => ({
          userId: participant.id,
          amount: shareAmount,
        }));
      }

      const formattedSplits = activeSplits.map((split) => ({
        userId: split.userId,
        amount: split.amount,
        paid: split.userId === payerId,
      }));

      // Validate that the splits equal the total expense
      const totalSplitAmount = formattedSplits.reduce(
        (sum, split) => sum + split.amount,
        0
      );

      const tolerance = 0.01;

      if (
        formattedSplits.length === 0 ||
        Math.abs(totalSplitAmount - amount) > tolerance
      ) {
        toast.error(
          "Split amounts don't add up to the total. Please adjust your splits."
        );
        return;
      }

      // Individual expenses do not belong to a group
      const groupId =
        type === "individual"
          ? undefined
          : data.groupId;

      if (type === "group" && !groupId) {
        toast.error("Please select a group.");
        return;
      }

      // Create the expense
      await createExpense.mutate({
        description: data.description,
        amount,
        category: data.category || "Other",
        date: data.date.getTime(),
        paidByUserId: payerId,
        splitType: data.splitType,
        splits: formattedSplits,
        groupId,
      });

      toast.success("Expense created successfully!");

      // Reset form values while preserving the current user's payer default
      reset({
        description: "",
        amount: "",
        category: "",
        date: new Date(),
        paidByUserId: currentUser._id,
        splitType: "equal",
        groupId: undefined,
      });

      setSelectedDate(new Date());
      setSplits([]);

      const otherParticipant = expenseParticipants.find(
        (participant) =>
          participant.id !== currentUser._id
      );

      const otherUserId = otherParticipant?.id;

      if (onSuccess) {
        onSuccess(
          type === "individual"
            ? otherUserId
            : groupId
        );
      }
    } catch (error) {
      toast.error(
        "Failed to create expense: " +
          (error instanceof Error
            ? error.message
            : "An unexpected error occurred.")
      );
    }
  };

  if (!currentUser) return null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* Description and amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Description
            </Label>

            <Input
              id="description"
              placeholder="Lunch, movie tickets, etc."
              {...register("description")}
            />

            {errors.description && (
              <p className="text-sm text-red-500">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
              <Input
                id="amount"
                placeholder="0.00"
                type="number"
                step="0.01"
                min="0.01"
                className="pl-7"
                {...register("amount")}
              />
            </div>

            {errors.amount && (
              <p className="text-sm text-red-500">
                {errors.amount.message}
              </p>
            )}
          </div>
        </div>

        {/* Category and date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>

            <CategorySelector
              categories={categories || []}
              onChange={(categoryId) => {
                if (categoryId) {
                  setValue("category", categoryId, {
                    shouldValidate: true,
                  });
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate &&
                      "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />

                  {selectedDate ? (
                    format(selectedDate, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);

                      setValue("date", date, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {errors.date && (
              <p className="text-sm text-red-500">
                {errors.date.message}
              </p>
            )}
          </div>
        </div>

        {/* Group selector */}
        {type === "group" && (
          <div className="space-y-2">
            <Label>Group</Label>

            <GroupSelector
              onChange={(group) => {
                if (!group) return;

                if (
                  selectedGroup?.id === group.id
                ) {
                  return;
                }

                setSelectedGroup(group);

                setValue("groupId", group.id, {
                  shouldValidate: true,
                });

                if (
                  Array.isArray(group.members)
                ) {
                  setParticipants(group.members);

                  const currentUserIsMember =
                    group.members.some(
                      (member) =>
                        member.id === currentUser._id
                    );

                  const nextPayerId =
                    currentUserIsMember
                      ? currentUser._id
                      : group.members[0]?.id || "";

                  setValue(
                    "paidByUserId",
                    nextPayerId,
                    { shouldValidate: true }
                  );

                  setSplits([]);
                }
              }}
            />

            {!selectedGroup && (
              <p className="text-xs text-amber-600">
                Please select a group to continue
              </p>
            )}
          </div>
        )}

        {/* Participants for individual expenses */}
        {type === "individual" && (
          <div className="space-y-2">
            <Label>Participants</Label>

            <ParticipantSelector
              participants={expenseParticipants}
              onParticipantsChange={setParticipants}
            />

            {expenseParticipants.length <= 1 && (
              <p className="text-xs text-amber-600">
                Please add at least one other participant
              </p>
            )}
          </div>
        )}

        {/* Paid by selector */}
        <div className="space-y-2">
          <Label htmlFor="paidByUserId">
            Paid by
          </Label>

          <select
            id="paidByUserId"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...register("paidByUserId")}
          >
            <option value="">Select who paid</option>

            {expenseParticipants.map((participant) => (
              <option
                key={participant.id}
                value={participant.id}
              >
                {participant.id === currentUser._id
                  ? "You"
                  : participant.name}
              </option>
            ))}
          </select>

          {errors.paidByUserId && (
            <p className="text-sm text-red-500">
              {errors.paidByUserId.message}
            </p>
          )}
        </div>

        {/* Split type */}
        <div className="space-y-2">
          <Label>Split type</Label>

          <Tabs
            defaultValue="equal"
            onValueChange={(value) => {
              setValue("splitType", value, {
                shouldValidate: true,
              });

              setSplits([]);
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="equal">
                Equal
              </TabsTrigger>

              <TabsTrigger value="percentage">
                Percentage
              </TabsTrigger>

              <TabsTrigger value="exact">
                Exact Amounts
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="equal"
              className="pt-4"
            >
              <p className="text-sm text-muted-foreground">
                Split equally among all participants
              </p>

              <SplitSelector
                type="equal"
                amount={parseFloat(amountValue) || 0}
                participants={expenseParticipants}
                paidByUserId={effectivePayerId}
                onSplitsChange={setSplits}
              />
            </TabsContent>

            <TabsContent
              value="percentage"
              className="pt-4"
            >
              <p className="text-sm text-muted-foreground">
                Split by percentage
              </p>

              <SplitSelector
                type="percentage"
                amount={parseFloat(amountValue) || 0}
                participants={expenseParticipants}
                paidByUserId={effectivePayerId}
                onSplitsChange={setSplits}
              />
            </TabsContent>

            <TabsContent
              value="exact"
              className="pt-4"
            >
              <p className="text-sm text-muted-foreground">
                Enter exact amounts
              </p>

              <SplitSelector
                type="exact"
                amount={parseFloat(amountValue) || 0}
                participants={expenseParticipants}
                paidByUserId={effectivePayerId}
                onSplitsChange={setSplits}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Submit button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            expenseParticipants.length <= 1 ||
            (type === "group" && !selectedGroup)
          }
        >
          {isSubmitting
            ? "Creating..."
            : "Create Expense"}
        </Button>
      </div>
    </form>
  );
}
