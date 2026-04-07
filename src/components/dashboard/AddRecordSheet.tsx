"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

interface AddRecordSheetProps {
  open: boolean;
  onClose: () => void;
  farmId: string;
  plots: { id: string; label: string }[];
  onAdded: () => void;
}

const EXPENSE_CATEGORIES = [
  "Seed",
  "Fertilizer",
  "Pesticide",
  "Labor",
  "Equipment",
  "Transport",
  "Other",
];

const INCOME_CATEGORIES = ["Harvest Sale", "Subsidy", "Other"];

export default function AddRecordSheet({
  open,
  onClose,
  farmId,
  plots,
  onAdded,
}: AddRecordSheetProps) {
  const [recordType, setRecordType] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [plotId, setPlotId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categories =
    recordType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  // Reset category when switching types if current is invalid
  const handleTypeSwitch = (type: "expense" | "income") => {
    setRecordType(type);
    const newCategories =
      type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!newCategories.includes(category)) {
      setCategory("");
    }
  };

  const handleSubmit = async () => {
    if (!category) {
      toast.error("Please select a category");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: farmId,
          plot_id: plotId || null,
          record_type: recordType,
          category,
          amount: numAmount,
          description: description.trim() || null,
          record_date: recordDate,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add record");
      }

      toast.success(
        recordType === "income" ? "Income recorded!" : "Expense recorded!"
      );

      // Reset form
      setCategory("");
      setAmount("");
      setDescription("");
      setPlotId("");
      setRecordDate(new Date().toISOString().split("T")[0]);

      onAdded();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add record"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 bottom-0 left-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 pb-8"
          >
            {/* Handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />

            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Record</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 transition-colors hover:bg-gray-100"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Type Toggle */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => handleTypeSwitch("expense")}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  recordType === "expense"
                    ? "bg-red-500 text-white shadow-sm"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                Expense
              </button>
              <button
                onClick={() => handleTypeSwitch("income")}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  recordType === "income"
                    ? "bg-green-500 text-white shadow-sm"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                Income
              </button>
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Amount (RM)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional note..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
              />
            </div>

            {/* Date */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Date
              </label>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
              />
            </div>

            {/* Plot (optional) */}
            {plots.length > 0 && (
              <div className="mb-6">
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Plot (optional)
                </label>
                <div className="relative">
                  <select
                    value={plotId}
                    onChange={(e) => setPlotId(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                  >
                    <option value="">Farm-wide</option>
                    {plots.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Add Record"}
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
