'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchX, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { Avatar } from "../components/shared/thumb";
import { useSimulatedLoading } from "../components/shared/use-simulated-loading";
import { TableSkeleton } from "../components/ui/skeleton";
import { useStore } from "../data/store";
import { formatDate, formatPKR } from "../lib/format";

type SortKey = "newest" | "spend-desc" | "orders-desc" | "name";

export default function CustomersPage() {
  const { state } = useStore();
  const loading = useSimulatedLoading(300);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "registered" | "guest">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const stats = useMemo(() => {
    const map = new Map<string, { orders: number; spend: number }>();
    state.orders.forEach((order) => {
      if (!order.customerId) return;
      const entry = map.get(order.customerId) ?? { orders: 0, spend: 0 };
      entry.orders += 1;
      if (order.status !== "cancelled") entry.spend += order.total;
      map.set(order.customerId, entry);
    });
    return map;
  }, [state.orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = state.customers.filter((customer) => {
      const matchesQuery =
        !q ||
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.phone.includes(q) ||
        customer.city.toLowerCase().includes(q);
      const matchesType = type === "all" || customer.type === type;
      return matchesQuery && matchesType;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      const aStats = stats.get(a.id) ?? { orders: 0, spend: 0 };
      const bStats = stats.get(b.id) ?? { orders: 0, spend: 0 };
      switch (sort) {
        case "spend-desc":
          return bStats.spend - aStats.spend;
        case "orders-desc":
          return bStats.orders - aStats.orders;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return +new Date(b.registeredAt) - +new Date(a.registeredAt);
      }
    });
    return sorted;
  }, [state.customers, query, type, sort, stats]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const registeredCount = state.customers.filter((c) => c.type === "registered").length;
  const guestCount = state.customers.length - registeredCount;
  const lifetimeValue = state.customers.reduce(
    (sum, customer) => sum + (stats.get(customer.id)?.spend ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="Registered shoppers and guest checkouts with their order history and lifetime value."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Registered customers", value: registeredCount, icon: Users },
          { label: "Guest checkouts", value: guestCount, icon: UserRound },
          { label: "Lifetime value", value: formatPKR(lifetimeValue), icon: Users },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                  {stat.value}
                </p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <stat.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Search name, email, phone or city…"
              className="w-full lg:max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as "all" | "registered" | "guest");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="registered">Registered</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Recently joined</SelectItem>
                  <SelectItem value="spend-desc">Highest spend</SelectItem>
                  <SelectItem value="orders-desc">Most orders</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : visible.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<SearchX className="h-5 w-5" />}
              title="No customers found"
              description="Try a different search term or customer type."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total spend</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((customer) => {
                    const customerStats = stats.get(customer.id) ?? { orders: 0, spend: 0 };
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar name={customer.name} />
                            <div className="min-w-0">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="block truncate text-[13px] font-medium text-ink hover:text-brand-700"
                              >
                                {customer.name}
                              </Link>
                              <Badge
                                variant={customer.type === "registered" ? "brand" : "neutral"}
                                className="mt-0.5"
                              >
                                {customer.type === "registered" ? "Registered" : "Guest"}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="truncate text-[12.5px] text-ink-soft">{customer.email}</p>
                          <p className="text-[11.5px] text-ink-muted">{customer.phone}</p>
                        </TableCell>
                        <TableCell>{customer.city}</TableCell>
                        <TableCell className="text-right tabular">{customerStats.orders}</TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {formatPKR(customerStats.spend)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(customer.registeredAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
