import React, { useEffect, useState } from "react";
import WebknotValueDirectory from "./WebknotValueDirectory";
import {
    fetchValues,
    addValue,
    updateValue,
    deleteValue,
} from "../api/webknotValueApi";

export default function WebknotValueDirectoryPage() {
    const [values, setValues] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Load data
    const loadValues = async () => {
        try {
            const data = await fetchValues(true);
            setValues(data);
        } catch (err) {
            console.error(err);
            alert("Failed to load values");
        }
    };

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                const data = await fetchValues(true);
                if (isMounted) {
                    setValues(data);
                }
            } catch (err) {
                console.error(err);
                alert("Failed to load values");
            }
        };

        load();

        return () => {
            isMounted = false;
        };
    }, []);

    // Add
    const handleAdd = async () => {
        const title = prompt("Enter title");
        const pillar = prompt("Enter pillar");
        const description = prompt("Enter description");

        if (!title || !pillar) return;

        try {
            await addValue({ title, pillar, description });
            await loadValues();
        } catch (err) {
            alert(err.message);
        }
    };

    // Edit
    const handleEdit = async (value) => {
        const title = prompt("Edit title", value.title);
        const pillar = prompt("Edit pillar", value.pillar);
        const description = prompt("Edit description", value.description);

        try {
            await updateValue(value.id, { title, pillar, description });
            await loadValues();
        } catch (err) {
            alert(err.message);
        }
    };

    // Delete
    const handleDelete = async (value) => {
        if (!window.confirm("Are you sure you want to delete this value?")) return;

        try {
            await deleteValue(value.id);
            await loadValues();
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <WebknotValueDirectory
            values={values}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddValue={handleAdd}
            onEditValue={handleEdit}
            onDeleteValue={handleDelete}
        />
    );
}
