
"use client";

import { useMemo, useState } from "react";
import { useConvexQuery } from "@/hooks/use-convex-query";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export function SplitSelector({
  type,
  amount,
  participants,
  paidByUserId,
  onSplitsChange,
}) {
  const { data: currentUser } = useConvexQuery(api.users.getCurrentUser);

  const signature = JSON.stringify({
    type,
    amount,
    paidByUserId,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      imageUrl: p.imageUrl,
    })),
  });

    
  const baseSplits = useMemo(() => {
    if (!amount || amount <= 0 || participants.length === 0) {
      return [];
    }

    const shareAmount = amount / participants.length;
    const sharePercentage = 100 / participants.length;

    return participants.map((participant) => ({
      userId: participant.id,
      name: participant.name,
      email: participant.email,
      imageUrl: participant.imageUrl,
      amount: shareAmount,
      percentage: sharePercentage,
      paid: participant.id === paidByUserId,
    }));
  }, [amount, participants, paidByUserId]);


  const [editState, setEditState] = useState({
    signature: "",
    splits: [],
  });

  const splits =
    editState.signature === signature
      ? editState.splits
      : baseSplits;

  const totalAmount = splits.reduce(
    (sum, split) => sum + split.amount,
    0
  );

  const totalPercentage = splits.reduce(
    (sum, split) => sum + split.percentage,
    0
  );

  const isPercentageValid =
    Math.abs(totalPercentage - 100) < 0.01;

  const isAmountValid =
    Math.abs(totalAmount - amount) < 0.01;

  const commitSplits = (updatedSplits) => {
    setEditState({
      signature,
      splits: updatedSplits,
    });

    onSplitsChange?.(updatedSplits);
  };

  const updatePercentageSplit = (userId, newPercentage) => {
    const percentage = Math.max(
      0,
      Math.min(100, Number(newPercentage) || 0)
    );

    const updatedSplits = splits.map((split) =>
      split.userId === userId
        ? {
            ...split,
            percentage,
            amount: (amount * percentage) / 100,
          }
        : split
    );

    commitSplits(updatedSplits);
  };

  const updateExactSplit = (userId, newAmount) => {
    const parsedAmount = Math.max(
      0,
      Number.parseFloat(newAmount) || 0
    );

    const updatedSplits = splits.map((split) =>
      split.userId === userId
        ? {
            ...split,
            amount: parsedAmount,
            percentage:
              amount > 0
                ? (parsedAmount / amount) * 100
                : 0,
          }
        : split
    );

    commitSplits(updatedSplits);
  };

  return (
    <div className="space-y-4 mt-4">
      {splits.map((split) => (
        <div
          key={split.userId}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2 min-w-[120px]">
            <Avatar className="h-7 w-7">
              <AvatarImage src={split.imageUrl || undefined} />
              <AvatarFallback>
                {split.name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>

            <span className="text-sm">
              {split.userId === currentUser?._id ? "You" : split.name}
            </span>
          </div>

          {type === "equal" && (
            <div className="text-right text-sm">
              ${split.amount.toFixed(2)} (
              {split.percentage.toFixed(1)}%)
            </div>
          )}

          {type === "percentage" && (
            <div className="flex items-center gap-4 flex-1">
              <Slider
                value={[split.percentage]}
                min={0}
                max={100}
                step={1}
                onValueChange={(values) =>
                  updatePercentageSplit(split.userId, values[0])
                }
                className="flex-1"
              />

              <div className="flex gap-1 items-center min-w-[100px]">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={split.percentage}
                  onChange={(e) =>
                    updatePercentageSplit(
                      split.userId,
                      e.target.value
                    )
                  }
                  className="w-16 h-8"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <span className="text-sm ml-1">
                  ${split.amount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {type === "exact" && (
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1" />
              <div className="flex gap-1 items-center">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={split.amount}
                  onChange={(e) =>
                    updateExactSplit(split.userId, e.target.value)
                  }
                  className="w-24 h-8"
                />
                <span className="text-sm text-muted-foreground ml-1">
                  ({split.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-between border-t pt-3 mt-3">
        <span className="font-medium">Total</span>
        <div className="text-right">
          <span
            className={`font-medium ${
              !isAmountValid ? "text-amber-600" : ""
            }`}
          >
            ${totalAmount.toFixed(2)}
          </span>

          {type !== "equal" && (
            <span
              className={`text-sm ml-2 ${
                !isPercentageValid ? "text-amber-600" : ""
              }`}
            >
              ({totalPercentage.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {type === "percentage" && !isPercentageValid && (
        <div className="text-sm text-amber-600 mt-2">
          The percentages should add up to 100%.
        </div>
      )}

      {type === "exact" && !isAmountValid && (
        <div className="text-sm text-amber-600 mt-2">
          The sum of all splits (${totalAmount.toFixed(2)}) should equal
          the total amount (${amount.toFixed(2)}).
        </div>
      )}
    </div>
  );
}