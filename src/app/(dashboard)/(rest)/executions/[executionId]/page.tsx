interface PageProps {
    params: Promise<{
        executionId: string;
    }>
};


const Page = async ({ params } : PageProps) => {
    const { executionId } = await params;
    return <p>Execution id: { executionId } </p>
}


export default Page;