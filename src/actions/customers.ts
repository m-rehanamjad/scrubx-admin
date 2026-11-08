"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { customerService } from "../server/services/customer.service.ts";
import {
  updateCustomerSchema,
  customerAddressSchema,
  deleteCustomerAddressSchema,
} from "../server/validation/customers.ts";

/**
 * Server Action: Update customer details and administrative notes.
 * Strictly requires administrator privileges.
 */
export const updateCustomerAction = createSafeAction(
  {
    schema: updateCustomerSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await customerService.updateCustomer(input, admin);
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.id}`);
    return updated;
  }
);

/**
 * Server Action: Add or update customer address.
 * Strictly requires administrator privileges.
 */
export const saveCustomerAddressAction = createSafeAction(
  {
    schema: customerAddressSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const address = await customerService.saveAddress(input, admin);
    revalidatePath(`/customers/${input.customerId}`);
    return address;
  }
);

/**
 * Server Action: Delete customer address.
 * Strictly requires administrator privileges.
 */
export const deleteCustomerAddressAction = createSafeAction(
  {
    schema: deleteCustomerAddressSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const success = await customerService.deleteAddress(input, admin);
    revalidatePath(`/customers/${input.customerId}`);
    return success;
  }
);
