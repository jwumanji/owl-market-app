import NewInventoryForm from "./NewInventoryForm";

export const metadata = {
  title: "Add Inventory - OWL Market",
};

export default function NewInventoryPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-8">
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Internal Tool</p>
          <h1 className="admin-title">Add Inventory</h1>
          <p className="admin-subline">
            Search the card catalog, then create itemized inventory entries for your store.
          </p>
        </div>
      </div>

      <NewInventoryForm />
    </section>
  );
}
