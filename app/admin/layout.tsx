export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="pointer-events-auto min-h-screen max-h-screen overflow-y-auto bg-gray-50 relative z-20">
            {children}
        </div>
    );
}
