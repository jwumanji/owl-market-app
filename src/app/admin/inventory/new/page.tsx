import NewInventoryForm from "./NewInventoryForm";

export const metadata = {
  title: "Add Inventory - OWL Market",
};

export default function NewInventoryPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="mb-6">
        <p className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider text-owl">Internal Tool</p>
        <h1 className="text-4xl font-bold tracking-tight text-text">Add Inventory</h1>
        <p className="mt-2 max-w-2xl text-base text-text">
          Search the card catalog, then create itemized inventory entries for your store.
        </p>
      </div>

      <NewInventoryForm />
    </section>
  );
}
