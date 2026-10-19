CREATE TABLE "MenuCatalogItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "outletId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "prepTime" TEXT,
  "imageUrl" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuCatalogItem_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MenuCatalogItem_outletId_createdAt_idx" ON "MenuCatalogItem"("outletId", "createdAt");
