-- CreateTable
CREATE TABLE "system_info" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_info_pkey" PRIMARY KEY ("id")
);
